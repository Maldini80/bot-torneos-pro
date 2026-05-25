import { getDb } from '../../database.js';
import { ObjectId } from 'mongodb';
import { fetchVpgSpainLeagues } from './vpgCrawler.js';

export let rebuildStatus = { running: false, progress: '', error: null, startedAt: null, completedAt: null };

export function updateRebuildStatus(updates) {
    Object.assign(rebuildStatus, updates);
}

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARD_POS_MAP = {
    'top_gk': 'POR',
    'top_cb': 'DFC',
    'top_fb': 'CARR',
    'top_cdm': 'MC',
    'top_cam': 'MC',
    'top_wingers': 'CARR',
    'top_strikers': 'DC'
};

function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '') // remove spaces, punctuation
        .replace(/esports|cf|fc|gaming/g, '') // remove common suffixes
        .trim();
}

function findDbTeam(vpgTeam, dbTeams) {
    const vpgSlug = String(vpgTeam.team_slug || '').toLowerCase().trim();
    const vpgName = String(vpgTeam.team_name || '').toLowerCase().trim();
    
    // 1. Match by vpgTeamSlug (case-insensitive)
    let match = dbTeams.find(t => String(t.vpgTeamSlug || '').toLowerCase().trim() === vpgSlug);
    if (match) return match;
    
    // 2. Match by abbreviation
    match = dbTeams.find(t => String(t.vpgTeamSlug || '').toLowerCase().trim() === String(vpgTeam.team_abbr || '').toLowerCase().trim());
    if (match) return match;

    // 3. Match by name exact (case-insensitive)
    match = dbTeams.find(t => String(t.name || '').toLowerCase().trim() === vpgName);
    if (match) return match;

    // 4. Match by normalized name
    const normVpg = normalizeName(vpgName);
    match = dbTeams.find(t => normalizeName(t.name) === normVpg);
    if (match) return match;

    // 5. Match by eaClubName (some teams have eaClubName set)
    match = dbTeams.find(t => normalizeName(t.eaClubName) === normVpg);
    if (match) return match;

    return null;
}

function getLeagueDivisionMultiplier(slug) {
    if (!slug) return 1.0;
    const s = slug.toLowerCase().trim();
    if (s === 'superliga-spain-a' || s === 'superliga-spain-b') {
        return 1.0; // 1ª División
    }
    if (s.includes('segunda')) {
        return 0.75; // 2ª División (-25%)
    }
    if (s.includes('tercera')) {
        return 0.55; // 3ª División (-45%)
    }
    if (s.includes('cuarta')) {
        return 0.40; // 4ª División (-60%)
    }
    if (s.includes('quinta')) {
        return 0.30; // 5ª División (-70%)
    }
    return 1.0; // default/fallback
}

function isPlayerInLineup(lineup, playerName) {
    if (!lineup || !playerName) return false;
    const nameLower = playerName.toLowerCase();
    if (lineup.POR && lineup.POR.toLowerCase() === nameLower) return true;
    if (Array.isArray(lineup.DFC) && lineup.DFC.some(p => p && p.toLowerCase() === nameLower)) return true;
    if (Array.isArray(lineup.MC) && lineup.MC.some(p => p && p.toLowerCase() === nameLower)) return true;
    if (Array.isArray(lineup.DC) && lineup.DC.some(p => p && p.toLowerCase() === nameLower)) return true;
    return false;
}

export function calculatePlayerPointsAndPrice(p) {
    const stats = p.stats || {};
    const vpgPoints = stats.vpgPoints || 0;
    const matchesPlayed = stats.matchesPlayed || 0;
    
    let avgRating = 6.0;
    if (matchesPlayed > 0) {
        if (Array.isArray(stats.ratings) && stats.ratings.length > 0) {
            const sum = stats.ratings.reduce((acc, r) => acc + (parseFloat(r) || 0), 0);
            avgRating = sum / matchesPlayed;
        } else {
            avgRating = 6.0;
        }
    }

    // 1. Calcular precio (usar manualPrice si está definido, si no, dinámico)
    let price;
    const posUpper = (p.manualPosition || p.lastPosition || '').toUpperCase();
    const isGk = posUpper === 'POR' || posUpper === 'GK';

    if (p.manualPrice !== undefined && p.manualPrice !== null) {
        price = p.manualPrice;
    } else {
        price = 1000000;
        price += (stats.goals || 0) * 250000;
        price += (stats.assists || 0) * 200000;
        const isDefOrGk = ['POR', 'DFC', 'LD', 'LI', 'CAD', 'CAI', 'CARR', 'GK'].includes(posUpper);
        if (isDefOrGk) price += (stats.cleanSheets || 0) * 150000;
        
        // Ajustes por victorias/derrotas de equipo en el valor
        price += (stats.wins || 0) * 50000;
        price -= (stats.losses || 0) * 25000;

        if (avgRating > 6.0) price *= (1 + (avgRating - 6.0) * 0.5);

        // Doblar precio si es portero (x2)
        if (isGk) {
            price *= 2;
        }

        // Multiplicador de escala de presupuesto (factor x5.33333333)
        price *= 5.33333333;

        // Aplicar multiplicador por división/liga
        const divMult = getLeagueDivisionMultiplier(p.vpgLeagueSlug);
        price *= divMult;
    }

    // Límites y Redondeo
    const divMult = getLeagueDivisionMultiplier(p.vpgLeagueSlug);
    const minPrice = 2600000 * divMult;
    price = Math.min(80000000, Math.max(minPrice, price));
    price = Math.round(price / 50000) * 50000;


    // 2. Usar los puntos oficiales de VPG directamente
    let points = vpgPoints;

    return { price, points, avgRating };
}

export async function syncFantasyWithVpg() {
    if (rebuildStatus.running) {
        throw new Error('Ya hay una sincronización/reconstrucción en curso.');
    }

    updateRebuildStatus({
        running: true,
        progress: 'Iniciando sincronización con VPG...',
        error: null,
        startedAt: new Date(),
        completedAt: null
    });

    try {
        const db = getDb();
        const testDb = getDb('test');
        const playerColl = db.collection('player_profiles');
        const clubColl = db.collection('club_profiles');

        // 1. Obtener ligas activas del Fantasy
        let activeLeagues = [];
        try {
            const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
            if (config && Array.isArray(config.slugs)) {
                activeLeagues = config.slugs;
            } else {
                const allLeagues = await fetchVpgSpainLeagues();
                activeLeagues = allLeagues.map(l => l.slug);
            }
        } catch (e) {
            console.error('[VPG SYNC] Error leyendo fantasy_config, usando fallback:', e);
            try {
                const allLeagues = await fetchVpgSpainLeagues();
                activeLeagues = allLeagues.map(l => l.slug);
            } catch (err) {
                activeLeagues = ["superliga-spain-a", "superliga-spain-b"];
            }
        }

        updateRebuildStatus({ progress: `Ligas activas: ${activeLeagues.join(', ')}. Recuperando equipos de base de datos...` });

        // 2. Obtener equipos de la DB correspondientes a estas ligas
        const dbTeams = await testDb.collection('teams').find({ vpgLeagueSlug: { $in: activeLeagues } }).toArray();
        console.log(`[VPG SYNC] Cargados ${dbTeams.length} equipos de la DB.`);

        // Mapas para emparejar equipos de VPG Standings
        const vpgTeamToDbMap = new Map();
        const teamStandingsMap = new Map(); // team_slug -> standings data

        let totalPlayersUpdated = 0;
        let totalClubsUpdated = 0;

        // B. Cargar clausulazos activos para reatribución de puntos
        let unprocessedBuyouts = [];
        const attributionOverrides = new Map();
        try {
            unprocessedBuyouts = await db.collection('fantasy_buyouts').find({ processed: false }).toArray();
            console.log(`[VPG SYNC] Cargados ${unprocessedBuyouts.length} clausulazos activos.`);
            
            // Agrupar por liga y jugador (casing insensible)
            const playerBuyoutsMap = new Map();
            for (const b of unprocessedBuyouts) {
                const key = `${b.leagueId}_${b.eaPlayerName.toLowerCase()}`;
                if (!playerBuyoutsMap.has(key)) {
                    playerBuyoutsMap.set(key, []);
                }
                playerBuyoutsMap.get(key).push(b);
            }
            
            // Resolver cadena de traspasos por robo
            for (const [key, bList] of playerBuyoutsMap.entries()) {
                bList.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                const originalSeller = bList[0].sellerDiscordId;
                const finalBuyer = bList[bList.length - 1].buyerDiscordId;
                const eaPlayerName = bList[0].eaPlayerName;
                const leagueId = bList[0].leagueId;
                attributionOverrides.set(key, { originalSeller, finalBuyer, eaPlayerName, leagueId });
            }
        } catch (e) {
            console.error('[VPG SYNC] Error inicializando overrides de clausulazos:', e);
        }

        // B. Cargar todos los puntos VPG actuales en memoria para calcular incrementos (Deltas)
        console.log('[VPG SYNC] Cargando puntos previos de jugadores para cálculo incremental...');
        const playerOldVpgPoints = {};
        try {
            const allPlayers = await playerColl.find({}, { projection: { eaPlayerName: 1, "stats.vpgPoints": 1 } }).toArray();
            allPlayers.forEach(p => {
                if (p.eaPlayerName) {
                    playerOldVpgPoints[p.eaPlayerName.toLowerCase()] = p.stats?.vpgPoints || 0;
                }
            });
            console.log(`[VPG SYNC] Cargados puntos previos de ${Object.keys(playerOldVpgPoints).length} jugadores.`);
        } catch (e) {
            console.error('[VPG SYNC] Error cargando puntos previos de jugadores:', e);
        }

        // 3. Procesar cada liga activa
        for (const leagueSlug of activeLeagues) {
            // Check if this league already has players in our database before syncing
            let wasLeagueActive = false;
            try {
                const count = await playerColl.countDocuments({ vpgLeagueSlug: leagueSlug });
                wasLeagueActive = count > 0;
                console.log(`[VPG SYNC] Liga ${leagueSlug} - Jugadores existentes antes de sync: ${count} (wasLeagueActive: ${wasLeagueActive})`);
            } catch (e) {
                console.error(`[VPG SYNC] Error contando jugadores de la liga ${leagueSlug}:`, e);
            }

            // Quitar vpgLeagueSlug de los jugadores que tuvieran asignada esta liga antes,
            // para evitar que queden jugadores del pasado que ya no están activos en VPG.
            try {
                await playerColl.updateMany(
                    { vpgLeagueSlug: leagueSlug },
                    { $unset: { vpgLeagueSlug: "" } }
                );
            } catch (e) {
                console.error(`[VPG SYNC] Error limpiando vpgLeagueSlug para ${leagueSlug}:`, e);
            }

            updateRebuildStatus({ progress: `Sincronizando clasificación de ${leagueSlug}...` });

            // A. Fetch VPG league table (standings)
            const tableUrl = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/table/`;
            let standings = [];
            try {
                const res = await fetch(tableUrl, { headers: HEADERS });
                if (res.ok) {
                    const data = await res.json();
                    standings = Array.isArray(data) ? data : (data.data || data.results || []);
                } else {
                    console.error(`[VPG SYNC] Error obteniendo tabla para ${leagueSlug}: ${res.status}`);
                }
            } catch (e) {
                console.error(`[VPG SYNC] Error HTTP en tabla para ${leagueSlug}:`, e);
            }

            console.log(`[VPG SYNC] Clasificación de ${leagueSlug} obtenida: ${standings.length} equipos.`);

            // Emparejar cada equipo de la clasificación con un equipo en la base de datos
            for (const vpgTeam of standings) {
                const teamSlugLower = String(vpgTeam.team_slug || '').toLowerCase().trim();
                const teamNameLower = String(vpgTeam.team_name || '').toLowerCase().trim();

                // Siempre registrar en el mapa de clasificaciones (para escalar wins/losses/draws del jugador)
                if (teamSlugLower) teamStandingsMap.set(teamSlugLower, vpgTeam);
                if (teamNameLower) teamStandingsMap.set(teamNameLower, vpgTeam);

                const dbTeam = findDbTeam(vpgTeam, dbTeams);
                if (dbTeam) {
                    vpgTeamToDbMap.set(teamSlugLower, dbTeam);
                    vpgTeamToDbMap.set(teamNameLower, dbTeam);

                    // Actualizar club_profiles
                    const clubId = dbTeam.eaClubId;
                    if (clubId) {
                        const clubInc = {
                            'stats.matchesPlayed': vpgTeam.played || 0,
                            'stats.wins': vpgTeam.wins || 0,
                            'stats.losses': vpgTeam.losses || 0,
                            'stats.ties': vpgTeam.draws || 0,
                            'stats.goals': vpgTeam.score_for || 0,
                            'stats.goalsAgainst': vpgTeam.score_against || 0,
                            'stats.shots': 0,
                            'stats.shotsOnTarget': 0,
                            'stats.passesMade': 0,
                            'stats.passesAttempted': 0,
                            'stats.tacklesMade': 0,
                            'stats.tacklesAttempted': 0,
                            'stats.possession': 50,
                            'stats.possessionCount': vpgTeam.played || 0
                        };
                        
                        await clubColl.updateOne(
                            { eaClubId: clubId },
                            {
                                $set: { 
                                    eaClubName: dbTeam.name, 
                                    lastActive: new Date(),
                                    ...clubInc
                                }
                            },
                            { upsert: true }
                        );
                        totalClubsUpdated++;
                    }
                } else {
                    console.warn(`[VPG SYNC] No se encontró mapping en la DB para equipo VPG: "${vpgTeam.team_name}" (slug: ${vpgTeam.team_slug})`);
                }
            }
             // B. Fetch VPG position leaderboards with pagination
            const leaguePlayersMap = new Map();

            for (const [vpgPosKey, fantasyPos] of Object.entries(LEADERBOARD_POS_MAP)) {
                let offset = 0;
                let hasMore = true;
                let posPlayersCount = 0;

                while (hasMore) {
                    updateRebuildStatus({ progress: `Descargando líderes de ${leagueSlug} para ${fantasyPos} (offset: ${offset})...` });

                    const leaderboardUrl = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&type=all&limit=30&offset=${offset}`;
                    let pagePlayers = [];
                    try {
                        const res = await fetch(leaderboardUrl, { headers: HEADERS });
                        if (res.ok) {
                            const data = await res.json();
                            pagePlayers = data.data || [];
                            
                            // Si nos devuelve menos de 30 o un array vacío, no hay más páginas.
                            if (!Array.isArray(pagePlayers) || pagePlayers.length < 30) {
                                hasMore = false;
                            }
                        } else {
                            console.error(`[VPG SYNC] Error obteniendo leaderboard ${vpgPosKey} para ${leagueSlug} en offset ${offset}: ${res.status}`);
                            hasMore = false;
                        }
                    } catch (e) {
                        console.error(`[VPG SYNC] Error HTTP en leaderboard ${vpgPosKey} para ${leagueSlug} en offset ${offset}:`, e);
                        hasMore = false;
                    }

                    if (pagePlayers.length > 0) {
                        posPlayersCount += pagePlayers.length;
                        
                        // Procesar jugadores de esta página
                        for (const player of pagePlayers) {
                            const pSlug = String(player.team_slug || '').toLowerCase().trim();
                            const pName = String(player.team_name || '').toLowerCase().trim();
                            const dbTeam = vpgTeamToDbMap.get(pSlug) || vpgTeamToDbMap.get(pName);

                            const username = player.username;
                            if (!username) continue;

                            // Calcular partidos jugados y rating promedio
                            const played = player.matches_played || 0;
                            const ratingSum = player.match_rating || 0;
                            const avgRating = played > 0 ? (ratingSum / played) : 6.0;

                            // Escalar estadísticas del equipo a la proporción de partidos del jugador
                            const standing = teamStandingsMap.get(pSlug) || teamStandingsMap.get(pName);
                            let wins = 0, losses = 0, ties = 0;
                            if (standing) {
                                const ratio = (standing.played && standing.played > 0) ? Math.min(1, played / standing.played) : 1;
                                wins = Math.round((standing.wins || 0) * ratio);
                                ties = Math.round((standing.draws || 0) * ratio);
                                losses = Math.round((standing.losses || 0) * ratio);
                            }

                            const usernameLower = username.toLowerCase();
                            if (leaguePlayersMap.has(usernameLower)) {
                                const existing = leaguePlayersMap.get(usernameLower);
                                const existingStats = existing.stats;

                                // Si es la misma posición de fantasía, no sumamos, sino que tomamos la de mejores puntos para evitar duplicar
                                if (existing.lastPosition === fantasyPos) {
                                    if ((parseFloat(player.points) || 0) > (existingStats.vpgPoints || 0)) {
                                        existingStats.matchesPlayed = played;
                                        existingStats.goals = parseInt(player.goals) || 0;
                                        existingStats.assists = parseInt(player.assists) || 0;
                                        existingStats.shots = parseInt(player.shots) || 0;
                                        existingStats.saves = parseInt(player.saves) || 0;
                                        existingStats.redCards = parseInt(player.red_card) || 0;
                                        existingStats.yellowCards = parseInt(player.yellow_card) || 0;
                                        existingStats.cleanSheets = parseInt(player.clean_sheet) || 0;
                                        existingStats.ratings = Array(played).fill(avgRating);
                                        existingStats.wins = wins;
                                        existingStats.losses = losses;
                                        existingStats.ties = ties;
                                        existingStats.vpgPoints = parseFloat(player.points) || 0;

                                        if (player.user_avatar) existing.avatar = player.user_avatar;
                                        if (player.user_nationality) existing.nationality = player.user_nationality;
                                        if (dbTeam) existing.lastClub = dbTeam.name;
                                        existing.vpgTeamSlug = pSlug;
                                    }
                                } else {
                                    // Si es una posición de fantasía diferente, sumamos las estadísticas
                                    const mergedStats = {
                                        matchesPlayed: existingStats.matchesPlayed + played,
                                        goals: existingStats.goals + (parseInt(player.goals) || 0),
                                        assists: existingStats.assists + (parseInt(player.assists) || 0),
                                        passesMade: existingStats.passesMade,
                                        passesAttempted: existingStats.passesAttempted,
                                        tacklesMade: existingStats.tacklesMade,
                                        tacklesAttempted: existingStats.tacklesAttempted,
                                        shots: existingStats.shots + (parseInt(player.shots) || 0),
                                        shotsOnTarget: existingStats.shotsOnTarget,
                                        interceptions: existingStats.interceptions,
                                        saves: existingStats.saves + (parseInt(player.saves) || 0),
                                        redCards: existingStats.redCards + (parseInt(player.red_card) || 0),
                                        yellowCards: existingStats.yellowCards + (parseInt(player.yellow_card) || 0),
                                        mom: existingStats.mom,
                                        cleanSheets: existingStats.cleanSheets + (parseInt(player.clean_sheet) || 0),
                                        goalsConceded: existingStats.goalsConceded,
                                        ratings: existingStats.ratings.concat(Array(played).fill(avgRating)),
                                        wins: existingStats.wins + wins,
                                        losses: existingStats.losses + losses,
                                        ties: existingStats.ties + ties,
                                        vpgPoints: Math.round((existingStats.vpgPoints + (parseFloat(player.points) || 0)) * 10) / 10
                                    };

                                    // Comparar partidos para elegir la posición con más presencia
                                    let bestPosition = existing.lastPosition;
                                    if (played > existingStats.matchesPlayed) {
                                        bestPosition = fantasyPos;
                                    }

                                    existing.stats = mergedStats;
                                    existing.lastPosition = bestPosition;
                                    if (player.user_avatar) existing.avatar = player.user_avatar;
                                    if (player.user_nationality) existing.nationality = player.user_nationality;
                                    if (dbTeam) existing.lastClub = dbTeam.name;
                                    existing.vpgTeamSlug = pSlug;
                                }
                            } else {
                                const playerStats = {
                                    matchesPlayed: played,
                                    goals: parseInt(player.goals) || 0,
                                    assists: parseInt(player.assists) || 0,
                                    passesMade: 0,
                                    passesAttempted: 0,
                                    tacklesMade: 0,
                                    tacklesAttempted: 0,
                                    shots: parseInt(player.shots) || 0,
                                    shotsOnTarget: 0,
                                    interceptions: 0,
                                    saves: parseInt(player.saves) || 0,
                                    redCards: parseInt(player.red_card) || 0,
                                    yellowCards: parseInt(player.yellow_card) || 0,
                                    mom: 0,
                                    cleanSheets: parseInt(player.clean_sheet) || 0,
                                    goalsConceded: 0,
                                    ratings: Array(played).fill(avgRating),
                                    wins: wins,
                                    losses: losses,
                                    ties: ties,
                                    vpgPoints: parseFloat(player.points) || 0
                                };

                                leaguePlayersMap.set(usernameLower, {
                                    username: username,
                                    lastClub: dbTeam ? dbTeam.name : (player.team_name || player.team_slug || "VPG Club"),
                                    lastActive: new Date(),
                                    lastPosition: fantasyPos,
                                    vpgLeagueSlug: leagueSlug,
                                    vpgTeamSlug: pSlug,
                                    avatar: player.user_avatar || null,
                                    nationality: player.user_nationality || null,
                                    stats: playerStats
                                });
                            }
                        }
                    }

                    // Siguiente página
                    offset += 30;

                    // Límite de seguridad para evitar loops infinitos (máximo 40 páginas = 1200 jugadores)
                    if (offset >= 1200) {
                        hasMore = false;
                    }
                }

                console.log(`[VPG SYNC] Líderes para ${vpgPosKey} en ${leagueSlug}: ${posPlayersCount} jugadores.`);
            }

            // Guardar todos los jugadores agregados en la BD
            console.log(`[VPG SYNC] Guardando ${leaguePlayersMap.size} jugadores agregados en la liga ${leagueSlug}...`);
            for (const [usernameLower, pData] of leaguePlayersMap.entries()) {
                const { username, ...updateData } = pData;

                // Buscar jugador por eaPlayerName case-insensitively
                const existingPlayer = await playerColl.findOne({ 
                    eaPlayerName: { $regex: new RegExp('^' + username.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } 
                });

                if (existingPlayer) {
                    if (existingPlayer.excluded === true) {
                        continue;
                    }

                    // Conflict resolution: check if player is being crawled for a different division
                    if (existingPlayer.vpgLeagueSlug && existingPlayer.vpgLeagueSlug !== leagueSlug) {
                        let shouldSkip = false;
                        try {
                            console.log(`[VPG SYNC] Conflicto de división para ${username}: existente en "${existingPlayer.vpgLeagueSlug}", barriendo "${leagueSlug}". Verificando contrato activo...`);
                            const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
                            const contractRes = await fetch(contractsUrl, { headers: HEADERS });
                            if (contractRes.ok) {
                                const contracts = await contractRes.json();
                                if (Array.isArray(contracts)) {
                                    const activeContracts = contracts.filter(c => c.status === 'active');
                                    if (activeContracts.length > 0) {
                                        // Check if any active contract matches the team we are currently crawling (pData.vpgTeamSlug)
                                        const matchesActiveContract = activeContracts.some(c => 
                                            String(c.team_slug || '').toLowerCase().trim() === String(pData.vpgTeamSlug || '').toLowerCase().trim()
                                        );
                                        if (!matchesActiveContract) {
                                            console.log(`[VPG SYNC] Saltando actualización de ${username} para ${leagueSlug} / ${pData.vpgTeamSlug} porque su contrato activo está en otro club (Contratos activos: ${activeContracts.map(c => c.team_slug).join(', ')}).`);
                                            shouldSkip = true;
                                        }
                                    } else {
                                        console.log(`[VPG SYNC] El jugador ${username} no tiene contratos activos en VPG. Usando división superior como criterio.`);
                                        if (getLeagueDivisionMultiplier(existingPlayer.vpgLeagueSlug) > getLeagueDivisionMultiplier(leagueSlug)) {
                                            shouldSkip = true;
                                        }
                                    }
                                } else {
                                    if (getLeagueDivisionMultiplier(existingPlayer.vpgLeagueSlug) > getLeagueDivisionMultiplier(leagueSlug)) {
                                        shouldSkip = true;
                                    }
                                }
                            } else {
                                console.warn(`[VPG SYNC] Error HTTP al obtener contratos de ${username}: ${contractRes.status}. Usando división superior como criterio.`);
                                if (getLeagueDivisionMultiplier(existingPlayer.vpgLeagueSlug) > getLeagueDivisionMultiplier(leagueSlug)) {
                                    shouldSkip = true;
                                }
                            }
                        } catch (err) {
                            console.error(`[VPG SYNC] Excepción al comprobar contratos de ${username}:`, err);
                            if (getLeagueDivisionMultiplier(existingPlayer.vpgLeagueSlug) > getLeagueDivisionMultiplier(leagueSlug)) {
                                shouldSkip = true;
                            }
                        }

                        if (shouldSkip) {
                            continue;
                        }
                    }

                    await playerColl.updateOne(
                        { _id: existingPlayer._id },
                        { $set: updateData }
                    );
                } else {
                    // HEURISTIC: Check if this new player is a name-changed old player
                    let autoMerged = false;
                    const newPoints = updateData.stats ? (updateData.stats.vpgPoints || 0) : 0;
                    const newPJ = updateData.stats ? (updateData.stats.matchesPlayed || 0) : 0;
                    const newGoals = updateData.stats ? (updateData.stats.goals || 0) : 0;
                    const newAssists = updateData.stats ? (updateData.stats.assists || 0) : 0;

                    if (newPoints >= 70 && updateData.lastClub) {
                        // Search for inactive players in the same club with exact same stats
                        const potentialMatches = await playerColl.find({
                            lastClub: updateData.lastClub,
                            excluded: { $ne: true },
                            vpgLeagueSlug: { $ne: leagueSlug }, // Not active in this league/crawl
                            "stats.vpgPoints": newPoints,
                            "stats.matchesPlayed": newPJ,
                            "stats.goals": newGoals,
                            "stats.assists": newAssists
                        }).toArray();

                        if (potentialMatches.length === 1) {
                            const oldPlayer = potentialMatches[0];
                            const oldPlayerNameExact = oldPlayer.eaPlayerName;
                            const newPlayerNameExact = username; // username is the new name

                            console.log(`[VPG SYNC] [AUTO MERGE] Detectado cambio de nombre: ${oldPlayerNameExact} -> ${newPlayerNameExact} (Club: ${updateData.lastClub}, Puntos: ${newPoints})`);

                            // 1. Actualizar perfil antiguo con el nuevo nombre y datos
                            await playerColl.updateOne(
                                { _id: oldPlayer._id },
                                { 
                                    $set: { 
                                        eaPlayerName: newPlayerNameExact,
                                        ...updateData
                                    } 
                                }
                            );

                            // 2. Renombrar en equipos Fantasy
                            const affectedTeams = await db.collection('fantasy_teams').find({
                                players: { $regex: new RegExp('^' + oldPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
                            }).toArray();

                            for (const team of affectedTeams) {
                                const updatedPlayers = team.players.map(p => {
                                    if (p.toLowerCase() === oldPlayerNameExact.toLowerCase()) return newPlayerNameExact;
                                    return p;
                                });
                                const updatedLineup = { ...team.lineup };
                                for (const pos in updatedLineup) {
                                    if (Array.isArray(updatedLineup[pos])) {
                                        updatedLineup[pos] = updatedLineup[pos].map(p => {
                                            if (p && p.toLowerCase() === oldPlayerNameExact.toLowerCase()) return newPlayerNameExact;
                                            return p;
                                        });
                                    } else if (updatedLineup[pos] && updatedLineup[pos].toLowerCase() === oldPlayerNameExact.toLowerCase()) {
                                        updatedLineup[pos] = newPlayerNameExact;
                                    }
                                }
                                const updatedClauses = { ...team.clauses || {} };
                                const updatedClausesProtected = { ...team.clausesProtectedUntil || {} };
                                const clauseKey = Object.keys(updatedClauses).find(k => k.toLowerCase() === oldPlayerNameExact.toLowerCase());
                                if (clauseKey) {
                                    updatedClauses[newPlayerNameExact] = updatedClauses[clauseKey];
                                    delete updatedClauses[clauseKey];
                                }
                                const protectKey = Object.keys(updatedClausesProtected).find(k => k.toLowerCase() === oldPlayerNameExact.toLowerCase());
                                if (protectKey) {
                                    updatedClausesProtected[newPlayerNameExact] = updatedClausesProtected[protectKey];
                                    delete updatedClausesProtected[protectKey];
                                }

                                await db.collection('fantasy_teams').updateOne(
                                    { _id: team._id },
                                    {
                                        $set: {
                                            players: updatedPlayers,
                                            lineup: updatedLineup,
                                            clauses: updatedClauses,
                                            clausesProtectedUntil: updatedClausesProtected
                                        }
                                    }
                                );
                            }

                            // 3. Renombrar en ofertas del mercado y listas
                            await db.collection('fantasy_market_listings').updateMany(
                                { eaPlayerName: { $regex: new RegExp('^' + oldPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                                { $set: { eaPlayerName: newPlayerNameExact } }
                            );
                            await db.collection('fantasy_market_bids').updateMany(
                                { eaPlayerName: { $regex: new RegExp('^' + oldPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                                { $set: { eaPlayerName: newPlayerNameExact } }
                            );

                            // 4. Renombrar en basePoints de las ligas
                            const affectedLeagues = await db.collection('fantasy_leagues').find({
                                $or: [
                                    { marketFreeAgents: { $regex: new RegExp('^' + oldPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
                                    { [`basePoints.${oldPlayerNameExact}`]: { $exists: true } }
                                ]
                            }).toArray();

                            for (const league of affectedLeagues) {
                                const lUpdateOps = {};
                                if (Array.isArray(league.marketFreeAgents)) {
                                    lUpdateOps.marketFreeAgents = league.marketFreeAgents.map(p => {
                                        if (p.toLowerCase() === oldPlayerNameExact.toLowerCase()) return newPlayerNameExact;
                                        return p;
                                    });
                                }
                                if (league.basePoints) {
                                    const updatedBasePoints = { ...league.basePoints };
                                    const baseKey = Object.keys(updatedBasePoints).find(k => k.toLowerCase() === oldPlayerNameExact.toLowerCase());
                                    if (baseKey) {
                                        updatedBasePoints[newPlayerNameExact] = updatedBasePoints[baseKey];
                                        delete updatedBasePoints[baseKey];
                                        lUpdateOps.basePoints = updatedBasePoints;
                                    }
                                }
                                await db.collection('fantasy_leagues').updateOne({ _id: league._id }, { $set: lUpdateOps });
                            }

                            autoMerged = true;
                        }
                    }

                    if (!autoMerged) {
                        // Insertar nuevo jugador
                        const newPlayerDoc = {
                            eaPlayerName: username,
                            ...updateData,
                            build: {
                                height: null,
                                weight: null,
                                perks: {},
                                vproattr: "NH"
                            }
                        };
                        if (wasLeagueActive) {
                            newPlayerDoc.isNew = true;
                            newPlayerDoc.newUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                        }
                        await playerColl.insertOne(newPlayerDoc);
                    }
                }

                totalPlayersUpdated++;
            }
        }

        // A. Resolver fusiones automáticas de jugadores duplicados usando los enlaces de perfiles de VPG
        try {
            updateRebuildStatus({ progress: 'Detectando y fusionando perfiles de jugadores duplicados...' });
            await autoResolveVpgPlayerMerges(db);
        } catch (e) {
            console.error('[VPG SYNC] Error en la resolución automática de fusiones:', e);
        }

        // 4. Recalcular puntos de los equipos Fantasy de cada liga (incremental por alineación)
        updateRebuildStatus({ progress: 'Recalculando puntos de ligas y equipos de Fantasy...' });
        const leagues = await db.collection('fantasy_leagues').find().toArray();
        const leaguesMap = {};
        leagues.forEach(l => {
            leaguesMap[l._id.toString()] = l;
        });

        const fantasyTeams = await db.collection('fantasy_teams').find().toArray();
        for (const fTeam of fantasyTeams) {
            const league = leaguesMap[fTeam.leagueId];
            if (!league) continue;

            let teamDeltaPoints = 0;

            // Determinar qué jugadores están en el once titular (lineup)
            const playerStartersStatus = {}; // playerNameLower -> boolean
            if (fTeam.lineup) {
                const lineup = fTeam.lineup;
                if (lineup.POR) playerStartersStatus[lineup.POR.toLowerCase()] = true;
                if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && (playerStartersStatus[p.toLowerCase()] = true));
                if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && (playerStartersStatus[p.toLowerCase()] = true));
                if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && (playerStartersStatus[p.toLowerCase()] = true));
            }

            // Construir lista efectiva de jugadores aplicando reatribución por robo
            const effectivePlayers = [];
            for (const pName of (fTeam.players || [])) {
                const key = `${fTeam.leagueId}_${pName.toLowerCase()}`;
                if (attributionOverrides.has(key)) {
                    const override = attributionOverrides.get(key);
                    if (override.finalBuyer === fTeam.discordId) {
                        continue; // Excluir del comprador final
                    }
                }
                effectivePlayers.push(pName);
            }

            // Añadir jugadores robados (buyout overrides) que corresponden al vendedor para esta sincronización
            for (const [key, override] of attributionOverrides.entries()) {
                if (override.leagueId === fTeam.leagueId && override.originalSeller === fTeam.discordId) {
                    if (!effectivePlayers.includes(override.eaPlayerName)) {
                        effectivePlayers.push(override.eaPlayerName);
                        // Buscar el buyout correspondiente para saber si estaba en el 11 cuando fue robado
                        const buyout = unprocessedBuyouts.find(b => b.leagueId === fTeam.leagueId && b.eaPlayerName.toLowerCase() === override.eaPlayerName.toLowerCase());
                        if (buyout && buyout.wasStarter) {
                            playerStartersStatus[override.eaPlayerName.toLowerCase()] = true;
                        }
                    }
                }
            }

            for (const playerName of effectivePlayers) {
                const isStarter = playerStartersStatus[playerName.toLowerCase()] || false;
                if (!isStarter) continue; // Solo puntúan los titulares

                const player = await playerColl.findOne({ 
                    eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } 
                });
                if (player) {
                    const { points: rawPoints } = calculatePlayerPointsAndPrice(player);
                    const newVpgPoints = rawPoints;
                    const oldVpgPoints = playerOldVpgPoints[player.eaPlayerName.toLowerCase()] !== undefined 
                        ? playerOldVpgPoints[player.eaPlayerName.toLowerCase()] 
                        : newVpgPoints;

                    let oldLeaguePoints = oldVpgPoints;
                    let newLeaguePoints = newVpgPoints;

                    if (league.pointsMode === 'zero' && league.basePoints) {
                        const playerNameLower = player.eaPlayerName.toLowerCase();
                        let base = 0;
                        if (league.basePoints[player.eaPlayerName] !== undefined) {
                            base = league.basePoints[player.eaPlayerName];
                        } else {
                            const foundKey = Object.keys(league.basePoints).find(k => k.toLowerCase() === playerNameLower);
                            if (foundKey) {
                                base = league.basePoints[foundKey];
                            }
                        }
                        oldLeaguePoints = Math.max(0, Math.round((oldVpgPoints - base) * 10) / 10);
                        newLeaguePoints = Math.max(0, Math.round((newVpgPoints - base) * 10) / 10);
                    }

                    const playerDelta = Math.max(0, Math.round((newLeaguePoints - oldLeaguePoints) * 10) / 10);
                    teamDeltaPoints += playerDelta;
                }
            }

            teamDeltaPoints = Math.round(teamDeltaPoints * 10) / 10;

            if (teamDeltaPoints > 0) {
                const rewardAmount = teamDeltaPoints * 80000;
                await db.collection('fantasy_teams').updateOne(
                    { _id: fTeam._id },
                    { 
                        $inc: { 
                            points: teamDeltaPoints,
                            balance: rewardAmount
                        } 
                    }
                );
                console.log(`[VPG SYNC] El equipo ${fTeam.teamName} ha ganado ${rewardAmount.toLocaleString('es-ES')} € por ${teamDeltaPoints} puntos ganados por sus titulares en esta jornada.`);
            }
        }

        // Marcar los clausulazos procesados para que en la siguiente actualización puntúen normalmente
        try {
            if (unprocessedBuyouts.length > 0) {
                await db.collection('fantasy_buyouts').updateMany(
                    { _id: { $in: unprocessedBuyouts.map(b => b._id) } },
                    { $set: { processed: true, processedAt: new Date() } }
                );
                console.log(`[VPG SYNC] Se marcaron ${unprocessedBuyouts.length} clausulazos como procesados.`);
            }
        } catch (e) {
            console.error('[VPG SYNC] Error al marcar clausulazos como procesados:', e);
        }

        updateRebuildStatus({
            running: false,
            progress: `✅ Completado: Sincronizados ${totalPlayersUpdated} jugadores y ${totalClubsUpdated} clubes en total de las ligas de VPG España.`,
            completedAt: new Date()
        });

        console.log(`[VPG SYNC] Sincronización exitosa. ${rebuildStatus.progress}`);
    } catch (err) {
        console.error('[VPG SYNC] Error en sincronización:', err);
        updateRebuildStatus({
            running: false,
            error: err.message,
            progress: `❌ Error: ${err.message}`,
            completedAt: new Date()
        });
    }
}

export async function processLeagueMarketOffers(db) {
    console.log('[LEAGUE MARKET OFFER] Iniciando procesamiento de ofertas de la liga...');
    const now = new Date();
    const listings = await db.collection('fantasy_market_listings').find().toArray();
    if (listings.length === 0) {
        console.log('[LEAGUE MARKET OFFER] No hay jugadores en venta.');
        return;
    }

    const playerColl = db.collection('player_profiles');

    for (const listing of listings) {
        // Buscar el perfil del jugador
        const player = await playerColl.findOne({
            eaPlayerName: { $regex: new RegExp('^' + listing.eaPlayerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        });
        if (!player) {
            console.warn(`[LEAGUE MARKET OFFER] No se encontró perfil para el jugador listado: ${listing.eaPlayerName}`);
            continue;
        }

        // Buscar puja de la liga existente
        const existingBid = await db.collection('fantasy_market_bids').findOne({
            leagueId: listing.leagueId,
            eaPlayerName: listing.eaPlayerName,
            bidderDiscordId: 'liga'
        });

        if (!existingBid) {
            const { price } = calculatePlayerPointsAndPrice(player);
            // Generar un porcentaje aleatorio de incremento entre +13% y +25%
            const pct = Math.floor(Math.random() * (25 - 13 + 1)) + 13;
            const targetOffer = Math.round(price * (1 + pct / 100));

            // Crear nueva puja de la liga
            await db.collection('fantasy_market_bids').insertOne({
                leagueId: listing.leagueId,
                bidderDiscordId: 'liga',
                bidderTeamName: 'La Liga',
                sellerDiscordId: listing.sellerDiscordId,
                sellerTeamName: listing.sellerTeamName,
                eaPlayerName: listing.eaPlayerName,
                bidAmount: targetOffer,
                tier: 1,
                status: 'pending',
                createdAt: new Date()
            });
            console.log(`[LEAGUE MARKET OFFER] Nueva oferta de La Liga creada para ${listing.eaPlayerName} por ${targetOffer.toLocaleString('es-ES')} € (+${pct}%)`);
        }
    }
}


// ========== FANTASY RANDOM SQUAD & MARKET GENERATION ==========

export const FORMATION_STARTERS = {
    '4-3-3': { POR: 1, DFC: 4, MC: 3, DC: 3 },
    '4-4-2': { POR: 1, DFC: 4, MC: 4, DC: 2 },
    '4-5-1': { POR: 1, DFC: 4, MC: 5, DC: 1 },
    '5-3-2': { POR: 1, DFC: 5, MC: 3, DC: 2 },
    '5-4-1': { POR: 1, DFC: 5, MC: 4, DC: 1 },
    '3-5-2': { POR: 1, DFC: 3, MC: 5, DC: 2 },
    '3-4-3': { POR: 1, DFC: 3, MC: 4, DC: 3 },
    '3-1-4-2': { POR: 1, DFC: 3, MC: 5, DC: 2 }
};

export function mapPositionToMain(pos) {
    const posUpper = (pos || '').toUpperCase().trim();
    if (['POR', 'GK'].includes(posUpper)) return 'POR';
    if (['DFC', 'LD', 'LI', 'CARR', 'CAD', 'CAI', 'LTD', 'LTI', 'DFD', 'DFI'].includes(posUpper)) return 'DFC';
    if (['MC', 'MCD', 'MCO', 'MD', 'MI'].includes(posUpper)) return 'MC';
    if (['DC', 'ED', 'EI', 'MP'].includes(posUpper)) return 'DC';
    return 'MC'; // default
}

const FANTASY_FORMATIONS = {
    '4-4-2': {
        POR: [{ label: 'POR' }],
        DFC: [{ label: 'DFC L' }, { label: 'DFC CL' }, { label: 'DFC CR' }, { label: 'DFC R' }],
        MC: [{ label: 'MC L' }, { label: 'MC CL' }, { label: 'MC CR' }, { label: 'MC R' }],
        DC: [{ label: 'DC L' }, { label: 'DC R' }]
    },
    '4-3-3': {
        POR: [{ label: 'POR' }],
        DFC: [{ label: 'DFC L' }, { label: 'DFC CL' }, { label: 'DFC CR' }, { label: 'DFC R' }],
        MC: [{ label: 'MC L' }, { label: 'MC C' }, { label: 'MC R' }],
        DC: [{ label: 'EI' }, { label: 'DC' }, { label: 'ED' }]
    },
    '3-5-2': {
        POR: [{ label: 'POR' }],
        DFC: [{ label: 'DFC L' }, { label: 'DFC C' }, { label: 'DFC R' }],
        MC: [{ label: 'MI' }, { label: 'MCD L' }, { label: 'MCO' }, { label: 'MCD R' }, { label: 'MD' }],
        DC: [{ label: 'DC L' }, { label: 'DC R' }]
    },
    '4-5-1': {
        POR: [{ label: 'POR' }],
        DFC: [{ label: 'DFC L' }, { label: 'DFC CL' }, { label: 'DFC CR' }, { label: 'DFC R' }],
        MC: [{ label: 'MI' }, { label: 'MC L' }, { label: 'MCO' }, { label: 'MC R' }, { label: 'MD' }],
        DC: [{ label: 'DC' }]
    },
    '5-3-2': {
        POR: [{ label: 'POR' }],
        DFC: [{ label: 'LI' }, { label: 'DFC L' }, { label: 'DFC C' }, { label: 'DFC R' }, { label: 'LD' }],
        MC: [{ label: 'MC L' }, { label: 'MC C' }, { label: 'MC R' }],
        DC: [{ label: 'DC L' }, { label: 'DC R' }]
    },
    '5-4-1': {
        POR: [{ label: 'POR' }],
        DFC: [{ label: 'LI' }, { label: 'DFC L' }, { label: 'DFC C' }, { label: 'DFC R' }, { label: 'LD' }],
        MC: [{ label: 'MC L' }, { label: 'MC CL' }, { label: 'MC CR' }, { label: 'MC R' }],
        DC: [{ label: 'DC' }]
    },
    '3-1-4-2': {
        POR: [{ label: 'POR' }],
        DFC: [{ label: 'DFC L' }, { label: 'DFC C' }, { label: 'DFC R' }],
        MC: [{ label: 'MCD' }, { label: 'MI' }, { label: 'MC L' }, { label: 'MC R' }, { label: 'MD' }],
        DC: [{ label: 'DC L' }, { label: 'DC R' }]
    },
    '3-4-3': {
        POR: [{ label: 'POR' }],
        DFC: [{ label: 'DFC L' }, { label: 'DFC C' }, { label: 'DFC R' }],
        MC: [{ label: 'MI' }, { label: 'MC L' }, { label: 'MC R' }, { label: 'MD' }],
        DC: [{ label: 'EI' }, { label: 'DC' }, { label: 'ED' }]
    }
};

function isCentralDefender(pos) {
    return pos === 'DFC';
}

function isLateral(pos) {
    return ['LD', 'LI', 'LTD', 'LTI', 'CARR', 'CAD', 'CAI', 'DFD', 'DFI'].includes(pos);
}

function isMidfielder(pos) {
    return ['MC', 'MCD', 'MCO', 'MD', 'MI'].includes(pos);
}

function isForward(pos) {
    return ['DC', 'ED', 'EI', 'MP'].includes(pos);
}

function isGoalkeeper(pos) {
    return ['POR', 'GK'].includes(pos);
}

function isPlayerEligibleForSlot(playerPosition, slotKey, formation, slotIndex) {
    if (!playerPosition || !slotKey || !formation) return false;
    const pos = playerPosition.toUpperCase();
    const slot = slotKey.toUpperCase();
    
    if (slot === 'POR') {
        return isGoalkeeper(pos);
    }
    
    if (slot === 'DFC') {
        if (!isCentralDefender(pos) && !isLateral(pos)) {
            return false;
        }
        if (['3-5-2', '3-1-4-2', '3-4-3'].includes(formation)) {
            return isCentralDefender(pos);
        }
        if (['4-4-2', '4-3-3', '4-5-1'].includes(formation)) {
            if (slotIndex === 1 || slotIndex === 2) {
                return isCentralDefender(pos);
            }
            return true;
        }
        if (['5-3-2', '5-4-1'].includes(formation)) {
            if (slotIndex === 1 || slotIndex === 2 || slotIndex === 3) {
                return isCentralDefender(pos);
            }
            return true;
        }
        return true;
    }
    
    const layout = FANTASY_FORMATIONS[formation];
    const slotConfig = layout?.[slotKey]?.[slotIndex];
    if (!slotConfig) return false;
    const label = slotConfig.label.toUpperCase();
    
    if (slot === 'MC') {
        if (label === 'MI' || label === 'MD') {
            return isLateral(pos) || ['MI', 'MD'].includes(pos);
        } else {
            return isMidfielder(pos);
        }
    }
    
    if (slot === 'DC') {
        if (label === 'EI' || label === 'ED') {
            return isLateral(pos) || isForward(pos);
        } else {
            return isForward(pos);
        }
    }
    
    return false;
}

function allocateLineup(squadPlayers, formation) {
    const layout = FANTASY_FORMATIONS[formation];
    if (!layout) return null;

    const slots = [];
    slots.push({ key: 'POR', index: 0 });
    for (let i = 0; i < (layout.DFC ? layout.DFC.length : 0); i++) {
        slots.push({ key: 'DFC', index: i });
    }
    for (let i = 0; i < (layout.MC ? layout.MC.length : 0); i++) {
        slots.push({ key: 'MC', index: i });
    }
    for (let i = 0; i < (layout.DC ? layout.DC.length : 0); i++) {
        slots.push({ key: 'DC', index: i });
    }

    const assigned = new Array(slots.length).fill(null);
    const used = new Set();

    function backtrack(slotIdx) {
        if (slotIdx === slots.length) return true;

        const slot = slots[slotIdx];
        for (const player of squadPlayers) {
            if (used.has(player.eaPlayerName)) continue;

            if (isPlayerEligibleForSlot(player.manualPosition || player.lastPosition, slot.key, formation, slot.index)) {
                assigned[slotIdx] = player.eaPlayerName;
                used.add(player.eaPlayerName);

                if (backtrack(slotIdx + 1)) return true;

                used.delete(player.eaPlayerName);
                assigned[slotIdx] = null;
            }
        }
        return false;
    }

    if (backtrack(0)) {
        const lineup = {
            POR: assigned[0],
            DFC: [],
            MC: [],
            DC: []
        };
        let idx = 1;
        const dfcLen = layout.DFC ? layout.DFC.length : 0;
        for (let i = 0; i < dfcLen; i++) {
            lineup.DFC.push(assigned[idx++]);
        }
        const mcLen = layout.MC ? layout.MC.length : 0;
        for (let i = 0; i < mcLen; i++) {
            lineup.MC.push(assigned[idx++]);
        }
        const dcLen = layout.DC ? layout.DC.length : 0;
        for (let i = 0; i < dcLen; i++) {
            lineup.DC.push(assigned[idx++]);
        }
        return lineup;
    }

    return null;
}

/**
 * Genera una plantilla aleatoria completa de 11 titulares + 4 suplentes
 * respetando la formación, individual < 40M y coste total ~100M
 */
export async function generateRandomSquadForTeam(db, leagueId, teamId) {
    // 1. Fetch league and team
    const leagueDoc = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
    if (!leagueDoc) throw new Error('Liga no encontrada');

    const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(teamId) });
    if (!team) throw new Error('Equipo no encontrado');

    const formation = team.formation || '3-1-4-2';
    const startersConf = FORMATION_STARTERS[formation] || FORMATION_STARTERS['3-1-4-2'];

    // 2. Fetch all eligible players
    const vpgLeagues = leagueDoc.vpgLeagues || [];
    const rawPlayers = await db.collection('player_profiles').find({
        vpgLeagueSlug: { $in: vpgLeagues }
    }).toArray();

    // Calculate price for all eligible players
    const allEligiblePlayers = rawPlayers.map(p => {
        const { price } = calculatePlayerPointsAndPrice(p);
        return {
            eaPlayerName: p.eaPlayerName,
            lastPosition: p.manualPosition || p.lastPosition || 'MC',
            price
        };
    });

    // 3. Filter out players already owned in this league (except by this team, if it's a reset)
    const otherTeams = await db.collection('fantasy_teams').find({
        leagueId: leagueId.toString(),
        _id: { $ne: new ObjectId(teamId) }
    }).toArray();
    const ownedPlayerNames = new Set();
    otherTeams.forEach(t => {
        (t.players || []).forEach(pName => ownedPlayerNames.add(pName.toLowerCase()));
    });

    const marketFreeAgents = new Set(
        Array.isArray(leagueDoc.marketFreeAgents)
            ? leagueDoc.marketFreeAgents.map(name => name.toLowerCase())
            : []
    );

    const pool = allEligiblePlayers.filter(p => {
        const nameLower = p.eaPlayerName.toLowerCase();
        if (ownedPlayerNames.has(nameLower)) return false;
        if (marketFreeAgents.has(nameLower)) return false;
        // Individual player price must not exceed 55M
        if (p.price > 55000000) return false;
        return true;
    });

    // Partition available pool by position constraints
    const poolPOR = pool.filter(p => isGoalkeeper(p.lastPosition));
    const poolCB = pool.filter(p => isCentralDefender(p.lastPosition));
    const poolDC = pool.filter(p => p.lastPosition === 'DC');
    const poolMCStrict = pool.filter(p => ['MC', 'MCD', 'MCO'].includes(p.lastPosition));
    const poolCARR = pool.filter(p => isLateral(p.lastPosition));

    // Validate that we have enough candidates in the database
    if (poolPOR.length < 1 || poolCB.length < 3 || poolDC.length < 3 || poolMCStrict.length < 4 || poolCARR.length < 3) {
        throw new Error('No hay suficientes jugadores en la base de datos con las posiciones mínimas requeridas para generar una plantilla.');
    }

    // 4. Randomized selection targeting total squad cost around 100M (range: 90M to 110M)
    // We can do a fast Monte Carlo search (up to 2000 iterations)
    let selectedSquad = null;
    let closestSquad = null;
    let closestDiff = Infinity;

    for (let iter = 0; iter < 2000; iter++) {
        const currentSquad = [];
        const usedNames = new Set();

        // Helper to pick from sub-pool without duplicates
        function pickFromPool(subPool, count) {
            const shuffled = [...subPool].sort(() => 0.5 - Math.random());
            const picked = [];
            for (const p of shuffled) {
                if (usedNames.has(p.eaPlayerName)) continue;
                picked.push(p);
                usedNames.add(p.eaPlayerName);
                if (picked.length === count) break;
            }
            if (picked.length < count) return null;
            return picked;
        }

        // 1. Pick minimum required ones (14 players total)
        const gks = pickFromPool(poolPOR, 1);
        const cbs = pickFromPool(poolCB, 3);
        const dcs = pickFromPool(poolDC, 3);
        const mcs = pickFromPool(poolMCStrict, 4);
        const carrs = pickFromPool(poolCARR, 3);

        if (!gks || !cbs || !dcs || !mcs || !carrs) {
            continue;
        }

        currentSquad.push(...gks, ...cbs, ...dcs, ...mcs, ...carrs); // 14 players

        // 2. Pick remaining 1 player from the rest of the pool to reach 15
        const restPool = pool.filter(p => !usedNames.has(p.eaPlayerName));
        const extra = pickFromPool(restPool, 1);
        if (!extra) continue;

        currentSquad.push(...extra); // 15 players total

        const totalCost = currentSquad.reduce((acc, p) => acc + p.price, 0);
        const diff = Math.abs(totalCost - 100000000);
        if (diff < closestDiff) {
            closestDiff = diff;
            closestSquad = { players: currentSquad, totalCost };
        }

        // Accept immediately if total cost is between 90M and 110M
        if (totalCost >= 90000000 && totalCost <= 110000000) {
            selectedSquad = { players: currentSquad, totalCost };
            break;
        }
    }

    const squadToUse = selectedSquad || closestSquad;
    if (!squadToUse) {
        throw new Error('No hay suficientes jugadores en la base de datos para generar una plantilla.');
    }

    // 5. Build lineup
    const playersList = squadToUse.players.map(p => p.eaPlayerName);

    // Try to allocate starters with strict position checks
    let lineup = allocateLineup(squadToUse.players, formation);
    if (!lineup) {
        // Fallback to old behavior
        const squadByPos = { POR: [], DFC: [], MC: [], DC: [] };
        squadToUse.players.forEach(p => {
            const mainPos = mapPositionToMain(p.lastPosition);
            squadByPos[mainPos].push(p.eaPlayerName);
        });
        lineup = {
            POR: squadByPos.POR[0] || null,
            DFC: squadByPos.DFC.slice(0, startersConf.DFC),
            MC: squadByPos.MC.slice(0, startersConf.MC),
            DC: squadByPos.DC.slice(0, startersConf.DC),
        };
    }

    // Calculate initial clauses for squad players (using player.price * clauseMultiplier)
    const clauseMultiplier = leagueDoc.clauseMultiplier || 1.5;
    const clauses = {};
    const clausesProtectedUntil = {};
    
    // Initial protection for 2 days
    const protectionExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    squadToUse.players.forEach(p => {
        clauses[p.eaPlayerName] = Math.round(p.price * clauseMultiplier);
        clausesProtectedUntil[p.eaPlayerName] = protectionExpiry;
    });

    // 6. Save back to the team in DB
    await db.collection('fantasy_teams').updateOne(
        { _id: new ObjectId(teamId) },
        {
            $set: {
                players: playersList,
                lineup,
                clauses,
                clausesProtectedUntil,
                balance: leagueDoc.initialBudget
            }
        }
    );

    return squadToUse;
}

/**
 * Genera el abanico de 30 agentes libres diarios para la liga
 * Asegura un abanico de calidad y min 5 jugadores por posición
 */
export async function generateMarketFreeAgentsPool(db, leagueDoc) {
    const leagueId = leagueDoc._id.toString();

    // 1. Get owned players in the league
    const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
    const ownedPlayerNames = new Set();
    teams.forEach(t => {
        (t.players || []).forEach(pName => ownedPlayerNames.add(pName.toLowerCase()));
    });

    // 2. Get all eligible players in the VPG leagues
    const vpgLeagues = leagueDoc.vpgLeagues || [];
    const rawPlayers = await db.collection('player_profiles').find({
        vpgLeagueSlug: { $in: vpgLeagues }
    }).toArray();

    // Calculate price for all players
    const allEligiblePlayers = rawPlayers.map(p => {
        const { price } = calculatePlayerPointsAndPrice(p);
        return {
            eaPlayerName: p.eaPlayerName,
            lastPosition: p.manualPosition || p.lastPosition || 'MC',
            price
        };
    });

    // Filter to get free agents (not owned)
    const freeAgents = allEligiblePlayers.filter(p => !ownedPlayerNames.has(p.eaPlayerName.toLowerCase()));

    // Group free agents by position
    const freeAgentsByPos = { POR: [], DFC: [], MC: [], DC: [] };
    freeAgents.forEach(p => {
        const mainPos = mapPositionToMain(p.lastPosition);
        freeAgentsByPos[mainPos].push(p);
    });

    const previousPool = new Set((leagueDoc.marketFreeAgents || []).map(n => n.toLowerCase()));

    // Selection helper function
    const selectForPosition = (pos, count) => {
        const posPool = freeAgentsByPos[pos] || [];
        if (posPool.length === 0) return [];

        const freshPool = posPool.filter(p => !previousPool.has(p.eaPlayerName.toLowerCase()));
        const repeatPool = posPool.filter(p => previousPool.has(p.eaPlayerName.toLowerCase()));

        const sortByPrice = (arr) => arr.sort((a, b) => b.price - a.price);
        
        const sortedFresh = sortByPrice(freshPool);
        const sortedRepeat = sortByPrice(repeatPool);

        const pickBalanced = (sourceArr, numToPick) => {
            if (sourceArr.length <= numToPick) return [...sourceArr];
            const tierSize = Math.ceil(sourceArr.length / 3);
            const tierGood = sourceArr.slice(0, tierSize);
            const tierMedium = sourceArr.slice(tierSize, tierSize * 2);
            const tierBad = sourceArr.slice(tierSize * 2);

            const picked = [];
            const targetGood = Math.ceil(numToPick * 0.3);
            const targetBad = Math.ceil(numToPick * 0.3);
            const targetMedium = numToPick - targetGood - targetBad;

            const pickRandomFromArr = (arr, num) => {
                const shuffled = [...arr].sort(() => 0.5 - Math.random());
                return shuffled.slice(0, num);
            };

            picked.push(...pickRandomFromArr(tierGood, targetGood));
            picked.push(...pickRandomFromArr(tierMedium, targetMedium));
            picked.push(...pickRandomFromArr(tierBad, targetBad));

            if (picked.length < numToPick) {
                const pickedNames = new Set(picked.map(p => p.eaPlayerName));
                const remaining = sourceArr.filter(p => !pickedNames.has(p.eaPlayerName));
                const shuffledRemaining = remaining.sort(() => 0.5 - Math.random());
                picked.push(...shuffledRemaining.slice(0, numToPick - picked.length));
            }

            return picked;
        };

        let selected = pickBalanced(sortedFresh, count);
        if (selected.length < count) {
            const needed = count - selected.length;
            const repeated = pickBalanced(sortedRepeat, needed);
            selected.push(...repeated);
        }

        return selected;
    };

    // Select at least 5 from each position (POR, DFC, MC, DC) -> 20 players total
    const finalSelection = [];
    const minCounts = { POR: 5, DFC: 5, MC: 5, DC: 5 };
    
    for (const pos of ['POR', 'DFC', 'MC', 'DC']) {
        const picked = selectForPosition(pos, minCounts[pos]);
        finalSelection.push(...picked);
    }

    // Pick 10 more to reach exactly 30 players
    const selectedNames = new Set(finalSelection.map(p => p.eaPlayerName.toLowerCase()));
    const remainingPool = freeAgents.filter(p => !selectedNames.has(p.eaPlayerName.toLowerCase()));

    const remainingByPos = { POR: [], DFC: [], MC: [], DC: [] };
    remainingPool.forEach(p => {
        const mainPos = mapPositionToMain(p.lastPosition);
        remainingByPos[mainPos].push(p);
    });

    const extraDistribution = { POR: 2, DFC: 3, MC: 3, DC: 2 };
    for (const pos of ['POR', 'DFC', 'MC', 'DC']) {
        const needed = extraDistribution[pos];
        const posPool = remainingByPos[pos] || [];
        const picked = posPool.sort(() => 0.5 - Math.random()).slice(0, needed);
        finalSelection.push(...picked);
    }

    if (finalSelection.length < 30) {
        const currentSelectedNames = new Set(finalSelection.map(p => p.eaPlayerName.toLowerCase()));
        const absoluteRemaining = freeAgents.filter(p => !currentSelectedNames.has(p.eaPlayerName.toLowerCase()));
        const extraPicks = absoluteRemaining.sort(() => 0.5 - Math.random()).slice(0, 30 - finalSelection.length);
        finalSelection.push(...extraPicks);
    }

    const finalNames = finalSelection.map(p => p.eaPlayerName);
    await db.collection('fantasy_leagues').updateOne(
        { _id: leagueDoc._id },
        { $set: { marketFreeAgents: finalNames } }
    );

    console.log(`[MARKET] Generados 30 agentes libres para la liga ${leagueDoc.name}:`, finalNames);
    return finalNames;
}

/**
 * Resuelve las pujas a ciegas por agentes libres.
 * Se adjudican a las pujas más altas en caso de que tengan hueco en la plantilla.
 * En caso de empate, gana la puja más antigua.
 * Se reembolsa de inmediato el saldo a los perdedores.
 */
export async function resolveFreeAgentBids(db, leagueDoc) {
    const leagueId = leagueDoc._id.toString();
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId,
        sellerDiscordId: 'SYSTEM',
        status: 'pending'
    }).toArray();

    if (bids.length === 0) {
        console.log(`[BIDS RESOLUTION] No hay pujas de agentes libres pendientes para la liga ${leagueDoc.name}`);
        return;
    }

    // Agrupar pujas por jugador
    const bidsByPlayer = {};
    bids.forEach(b => {
        if (!bidsByPlayer[b.eaPlayerName]) {
            bidsByPlayer[b.eaPlayerName] = [];
        }
        bidsByPlayer[b.eaPlayerName].push(b);
    });

    for (const playerName of Object.keys(bidsByPlayer)) {
        const playerBids = bidsByPlayer[playerName];
        // Ordenar de mayor a menor importe, y por fecha (más antigua gana)
        playerBids.sort((a, b) => {
            if (b.bidAmount !== a.bidAmount) {
                return b.bidAmount - a.bidAmount;
            }
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        let winnerBid = null;
        for (const bid of playerBids) {
            const team = await db.collection('fantasy_teams').findOne({ discordId: bid.bidderDiscordId, leagueId });
            if (team && team.approved) {
                winnerBid = bid;
                break;
            }
        }

        if (winnerBid) {
            // El ganador ya pagó la puja al hacerla, no restamos balance.
            // Conseguir datos de precio del jugador para establecer la cláusula inicial
            const playerDoc = await db.collection('player_profiles').findOne({ eaPlayerName: winnerBid.eaPlayerName });
            const price = playerDoc ? calculatePlayerPointsAndPrice(playerDoc).price : winnerBid.bidAmount;
            const clauseMultiplier = leagueDoc.clauseMultiplier || 1.5;
            const buyerInitialClause = Math.round(price * clauseMultiplier);
            const protectionExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // Protección de 2 días

            // Asignar jugador al ganador
            await db.collection('fantasy_teams').updateOne(
                { discordId: winnerBid.bidderDiscordId, leagueId },
                {
                    $push: { players: winnerBid.eaPlayerName },
                    $set: {
                        [`clauses.${winnerBid.eaPlayerName}`]: buyerInitialClause,
                        [`clausesProtectedUntil.${winnerBid.eaPlayerName}`]: protectionExpiry
                    }
                }
            );

            // Marcar puja ganadora como aceptada
            await db.collection('fantasy_market_bids').updateOne(
                { _id: winnerBid._id },
                { $set: { status: 'accepted' } }
            );

            console.log(`[BIDS RESOLUTION] Puja GANADA: ${winnerBid.bidderTeamName} ha fichado a ${winnerBid.eaPlayerName} por ${winnerBid.bidAmount.toLocaleString('es-ES')} €.`);
        }

        // Reembolsar y rechazar las demás pujas
        const loserBids = playerBids.filter(b => !winnerBid || b._id.toString() !== winnerBid._id.toString());
        for (const lb of loserBids) {
            await db.collection('fantasy_teams').updateOne(
                { discordId: lb.bidderDiscordId, leagueId },
                { $inc: { balance: lb.bidAmount } }
            );
            await db.collection('fantasy_market_bids').updateOne(
                { _id: lb._id },
                { $set: { status: 'rejected' } }
            );
            console.log(`[BIDS RESOLUTION] Puja RECHAZADA (reembolso): ${lb.bidderTeamName} ofertó ${lb.bidAmount.toLocaleString('es-ES')} € por ${lb.eaPlayerName}.`);
        }
    }
}

/**
 * Ejecuta los procesos de mercado del Fantasy de forma automatizada:
 * - Procesa ofertas de la máquina (La Liga)
 * - Resuelve pujas a ciegas por agentes libres
 * - Regenera el pool de agentes libres para el día siguiente
 */
export async function runMarketAutomation() {
    console.log('[MARKET AUTOMATION] Iniciando procesamiento automatizado de mercado...');
    try {
        const db = getDb();
        
        // 1. Procesar ofertas de compra de la liga para jugadores listados
        try {
            console.log('[MARKET AUTOMATION] Procesando ofertas de La Liga...');
            await processLeagueMarketOffers(db);
        } catch (e) {
            console.error('[MARKET AUTOMATION] Error al procesar ofertas de la liga:', e);
        }

        // 2. Procesar y adjudicar pujas a ciegas de agentes libres
        try {
            console.log('[MARKET AUTOMATION] Resolviendo pujas de agentes libres...');
            const leaguesList = await db.collection('fantasy_leagues').find({ status: { $ne: 'closed' } }).toArray();
            for (const lDoc of leaguesList) {
                await resolveFreeAgentBids(db, lDoc);
            }
        } catch (e) {
            console.error('[MARKET AUTOMATION] Error al resolver pujas de agentes libres:', e);
        }

        // 3. Regenerar el mercado de agentes libres de la liga
        try {
            console.log('[MARKET AUTOMATION] Regenerando mercado de agentes libres...');
            const leaguesList = await db.collection('fantasy_leagues').find({ status: { $ne: 'closed' } }).toArray();
            for (const lDoc of leaguesList) {
                await generateMarketFreeAgentsPool(db, lDoc);
            }
        } catch (e) {
            console.error('[MARKET AUTOMATION] Error al regenerar mercado de agentes libres:', e);
        }

        console.log('[MARKET AUTOMATION] Automatización de mercado completada con éxito.');
    } catch (err) {
        console.error('[MARKET AUTOMATION] Error fatal en la automatización del mercado:', err);
    }
}

// ========== AUTOMATED PLAYER MERGING & DE-DUPLICATION ==========

function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) {
            costs[s2.length] = lastValue;
        }
    }
    return costs[s2.length];
}

function getNameSimilarity(s1, s2) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function normalizePlayerName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function getSubstrings(str) {
    const substrings = new Set();
    const len = str.length;
    const size = Math.min(4, len);
    if (size <= 0) return substrings;
    for (let i = 0; i <= len - size; i++) {
        substrings.add(str.substring(i, i + size));
    }
    return substrings;
}

/**
 * Fondee/Combina dos perfiles de jugador (duplicatePlayerName -> mainPlayerName)
 * Actualiza fantasy_teams, fantasy_market_listings, fantasy_market_bids, fantasy_leagues.
 */
export async function mergePlayerProfiles(db, mainPlayerName, duplicatePlayerName) {
    const playerColl = db.collection('player_profiles');

    // 1. Encontrar ambos perfiles
    const mainPlayer = await playerColl.findOne({
        eaPlayerName: { $regex: new RegExp('^' + mainPlayerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
    });
    const dupPlayer = await playerColl.findOne({
        eaPlayerName: { $regex: new RegExp('^' + duplicatePlayerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
    });

    if (!mainPlayer) {
        throw new Error(`Perfil principal "${mainPlayerName}" no encontrado.`);
    }
    if (!dupPlayer) {
        throw new Error(`Perfil duplicado "${duplicatePlayerName}" no encontrado.`);
    }

    const mainPlayerNameExact = mainPlayer.eaPlayerName;
    const dupPlayerNameExact = dupPlayer.eaPlayerName;

    if (mainPlayerNameExact.toLowerCase() === dupPlayerNameExact.toLowerCase()) {
        console.warn(`[MERGE] El jugador principal y el duplicado son el mismo: ${mainPlayerNameExact}`);
        return;
    }

    // 2. Combinar estadísticas
    const mergedStats = {};
    const mainStats = mainPlayer.stats || {};
    const dupStats = dupPlayer.stats || {};

    const statsFields = [
        'matchesPlayed', 'goals', 'assists', 'passesMade', 'passesAttempted',
        'tacklesMade', 'tacklesAttempted', 'shots', 'shotsOnTarget', 'interceptions',
        'saves', 'redCards', 'yellowCards', 'mom', 'cleanSheets', 'goalsConceded',
        'wins', 'losses', 'ties'
    ];

    for (const field of statsFields) {
        mergedStats[field] = (mainStats[field] || 0) + (dupStats[field] || 0);
    }

    mergedStats.ratings = [ ...(mainStats.ratings || []), ...(dupStats.ratings || []) ];
    mergedStats.vpgPoints = Math.max(mainStats.vpgPoints || 0, dupStats.vpgPoints || 0);

    let lastClub = mainPlayer.lastClub || dupPlayer.lastClub;
    let vpgLeagueSlug = mainPlayer.vpgLeagueSlug || dupPlayer.vpgLeagueSlug;

    if (mainPlayer.lastActive && dupPlayer.lastActive) {
        const mainTime = new Date(mainPlayer.lastActive).getTime();
        const dupTime = new Date(dupPlayer.lastActive).getTime();
        if (dupTime > mainTime && dupPlayer.lastClub) {
            lastClub = dupPlayer.lastClub;
            vpgLeagueSlug = dupPlayer.vpgLeagueSlug || mainPlayer.vpgLeagueSlug;
        }
    }

    const updateDoc = {
        stats: mergedStats,
        vpgLeagueSlug,
        lastPosition: mainPlayer.lastPosition || dupPlayer.lastPosition,
        lastClub,
        avatar: mainPlayer.avatar || dupPlayer.avatar,
        nationality: mainPlayer.nationality || dupPlayer.nationality,
        manualPrice: mainPlayer.manualPrice !== undefined && mainPlayer.manualPrice !== null ? mainPlayer.manualPrice : dupPlayer.manualPrice,
        manualPosition: mainPlayer.manualPosition !== undefined && mainPlayer.manualPosition !== null ? mainPlayer.manualPosition : dupPlayer.manualPosition
    };

    // Si el jugador principal no tiene vpgProfile pero el duplicado sí, conservarlo
    if (dupPlayer.vpgProfile && !mainPlayer.vpgProfile) {
        updateDoc.vpgProfile = dupPlayer.vpgProfile;
    }

    // Eliminar campos null/undefined
    Object.keys(updateDoc).forEach(key => (updateDoc[key] === undefined || updateDoc[key] === null) && delete updateDoc[key]);

    // Guardar cambios en el principal y eliminar duplicado
    await playerColl.updateOne({ _id: mainPlayer._id }, { $set: updateDoc });
    await playerColl.deleteOne({ _id: dupPlayer._id });

    // 3. Reemplazar nombre en fantasy_teams (players, lineup, clauses, clausesProtectedUntil)
    const affectedTeams = await db.collection('fantasy_teams').find({
        players: { $regex: new RegExp('^' + dupPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
    }).toArray();

    for (const team of affectedTeams) {
        const updatedPlayers = team.players.map(p => {
            if (p.toLowerCase() === dupPlayerNameExact.toLowerCase()) {
                return mainPlayerNameExact;
            }
            return p;
        });

        const updatedLineup = { ...team.lineup };
        for (const pos in updatedLineup) {
            if (Array.isArray(updatedLineup[pos])) {
                updatedLineup[pos] = updatedLineup[pos].map(p => {
                    if (p && p.toLowerCase() === dupPlayerNameExact.toLowerCase()) {
                        return mainPlayerNameExact;
                    }
                    return p;
                });
            } else if (updatedLineup[pos] && updatedLineup[pos].toLowerCase() === dupPlayerNameExact.toLowerCase()) {
                updatedLineup[pos] = mainPlayerNameExact;
            }
        }

        const updatedClauses = { ...team.clauses || {} };
        const updatedClausesProtected = { ...team.clausesProtectedUntil || {} };
        
        const clauseKey = Object.keys(updatedClauses).find(k => k.toLowerCase() === dupPlayerNameExact.toLowerCase());
        if (clauseKey) {
            updatedClauses[mainPlayerNameExact] = updatedClauses[clauseKey];
            delete updatedClauses[clauseKey];
        }
        const protectKey = Object.keys(updatedClausesProtected).find(k => k.toLowerCase() === dupPlayerNameExact.toLowerCase());
        if (protectKey) {
            updatedClausesProtected[mainPlayerNameExact] = updatedClausesProtected[protectKey];
            delete updatedClausesProtected[protectKey];
        }

        await db.collection('fantasy_teams').updateOne(
            { _id: team._id },
            {
                $set: {
                    players: updatedPlayers,
                    lineup: updatedLineup,
                    clauses: updatedClauses,
                    clausesProtectedUntil: updatedClausesProtected
                }
            }
        );
    }

    // 4. Reemplazar nombre en fantasy_market_listings y fantasy_market_bids
    await db.collection('fantasy_market_listings').updateMany(
        { eaPlayerName: { $regex: new RegExp('^' + dupPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
        { $set: { eaPlayerName: mainPlayerNameExact } }
    );

    await db.collection('fantasy_market_bids').updateMany(
        { eaPlayerName: { $regex: new RegExp('^' + dupPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
        { $set: { eaPlayerName: mainPlayerNameExact } }
    );

    // 5. Reemplazar nombre en fantasy_leagues (marketFreeAgents y basePoints)
    const affectedLeagues = await db.collection('fantasy_leagues').find({
        $or: [
            { marketFreeAgents: { $regex: new RegExp('^' + dupPlayerNameExact.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } },
            { [`basePoints.${dupPlayerNameExact}`]: { $exists: true } }
        ]
    }).toArray();

    for (const league of affectedLeagues) {
        const updateOps = {};
        
        if (Array.isArray(league.marketFreeAgents)) {
            updateOps.marketFreeAgents = league.marketFreeAgents.map(p => {
                if (p.toLowerCase() === dupPlayerNameExact.toLowerCase()) {
                    return mainPlayerNameExact;
                }
                return p;
            });
        }
        
        if (league.basePoints) {
            const updatedBasePoints = { ...league.basePoints };
            const baseKey = Object.keys(updatedBasePoints).find(k => k.toLowerCase() === dupPlayerNameExact.toLowerCase());
            if (baseKey) {
                updatedBasePoints[mainPlayerNameExact] = updatedBasePoints[baseKey];
                delete updatedBasePoints[baseKey];
                updateOps.basePoints = updatedBasePoints;
            }
        }

        await db.collection('fantasy_leagues').updateOne(
            { _id: league._id },
            { $set: updateOps }
        );
    }

    console.log(`[MERGE] Fusión completada con éxito: ${dupPlayerNameExact} -> ${mainPlayerNameExact}`);
}

/**
 * Escanea la base de datos de perfiles, detecta duplicados candidatos usando substrings
 * y los verifica contra la API pública de VPG, limitando a un máximo de 15 peticiones por llamada.
 */
export async function autoResolveVpgPlayerMerges(db, ignoreLimit = false) {
    console.log('[VPG SYNC] [MERGE] Iniciando detección automática de duplicados...');
    const playerColl = db.collection('player_profiles');
    
    // 1. Obtener todos los perfiles de jugadores activos
    const players = await playerColl.find({ excluded: { $ne: true } }).toArray();
    
    // 2. Normalizar e indexar por substrings de 4 caracteres
    const playersList = [];
    const index = {};
    
    for (const p of players) {
        const norm = normalizePlayerName(p.eaPlayerName);
        if (!norm) continue;
        
        p.normalized = norm;
        p.substrings = getSubstrings(norm);
        playersList.push(p);
        
        for (const sub of p.substrings) {
            if (!index[sub]) {
                index[sub] = [];
            }
            index[sub].push(p);
        }
    }
    
    // 3. Buscar pares de candidatos potenciales
    const checkedPairs = new Set();
    const potentialPairs = [];
    
    for (const p1 of playersList) {
        const norm1 = p1.normalized;
        const candidates = new Set();
        
        for (const sub of p1.substrings) {
            for (const candidate of index[sub]) {
                if (candidate._id.toString() !== p1._id.toString()) {
                    candidates.add(candidate);
                }
            }
        }
        
        for (const p2 of candidates) {
            const pairKey = [p1._id.toString(), p2._id.toString()].sort().join('_');
            if (checkedPairs.has(pairKey)) continue;
            checkedPairs.add(pairKey);
            
            const norm2 = p2.normalized;
            const sim = getNameSimilarity(norm1, norm2);
            
            if (sim >= 0.70) {
                potentialPairs.push({ p1, p2, sim });
            }
        }
    }
    
    // 4. Filtrar parejas para optimizar: al menos uno debe tener vpgLeagueSlug (activo en Fantasy)
    // y el otro no debe tener vpgLeagueSlug (o tenerlo vacío/nulo, indicando que es el duplicado de crawler/partido)
    const optimizedPairs = potentialPairs.filter(pair => {
        const hasP1League = !!pair.p1.vpgLeagueSlug;
        const hasP2League = !!pair.p2.vpgLeagueSlug;
        return (hasP1League && !hasP2League) || (!hasP1League && hasP2League);
    });

    console.log(`[VPG SYNC] [MERGE] Encontrados ${optimizedPairs.length} pares potenciales optimizados (activo + inactivo) con similitud >= 70%.`);

    const MAX_API_QUERIES = 15;
    let apiQueriesCount = 0;
    let mergedCount = 0;
    
    for (const { p1, p2, sim } of optimizedPairs) {
        // Asegurar que ambos perfiles siguen existiendo (pueden haberse borrado en una fusión previa)
        const exists1 = await playerColl.findOne({ _id: p1._id });
        const exists2 = await playerColl.findOne({ _id: p2._id });
        if (!exists1 || !exists2) continue;
        
        // Identificar cuál de los dos es el activo (que tiene league slug, es decir, el VPG username)
        const mainPlayer = p1.vpgLeagueSlug ? p1 : p2;
        const dupPlayer = p1.vpgLeagueSlug ? p2 : p1;

        console.log(`[VPG SYNC] [MERGE] Evaluando par: principal "${mainPlayer.eaPlayerName}" y duplicado "${dupPlayer.eaPlayerName}" (Similitud: ${(sim*100).toFixed(1)}%)`);

        let verified = false;

        // Caso A: El perfil principal ya tiene guardados los datos de perfil VPG en caché local de DB
        if (mainPlayer.vpgProfile && mainPlayer.vpgProfile.lastChecked) {
            const cacheAge = Date.now() - new Date(mainPlayer.vpgProfile.lastChecked).getTime();
            const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
            
            if (cacheAge < ONE_WEEK) {
                const consoleIds = [
                    String(mainPlayer.vpgProfile.username || ''),
                    String(mainPlayer.vpgProfile.psn || ''),
                    String(mainPlayer.vpgProfile.origin || ''),
                    String(mainPlayer.vpgProfile.xbox || '')
                ].map(id => id.toLowerCase().trim()).filter(Boolean);
                
                if (consoleIds.includes(dupPlayer.eaPlayerName.toLowerCase().trim())) {
                    verified = true;
                    console.log(`[VPG SYNC] [MERGE] [CACHE] Confirmado por caché local de base de datos.`);
                }
            }
        }

        // Caso B: Si no está en caché (o expiró), y no hemos excedido el límite de llamadas API en este sync
        if (!verified) {
            if (!ignoreLimit && apiQueriesCount >= MAX_API_QUERIES) {
                console.log(`[VPG SYNC] [MERGE] Límite de llamadas API (${MAX_API_QUERIES}) alcanzado para este sync. Aplazando evaluación para el próximo ciclo.`);
                continue;
            }
            
            apiQueriesCount++;
            const url = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(mainPlayer.eaPlayerName)}/`;
            console.log(`[VPG SYNC] [MERGE] [API] Consultando API de VPG (${apiQueriesCount}/${MAX_API_QUERIES}): ${url}`);
            
            try {
                // Pequeño delay para no saturar
                await new Promise(r => setTimeout(r, 150));
                
                const res = await fetch(url, { headers: HEADERS });
                if (res.ok) {
                    const userData = await res.json();
                    
                    // Guardar en caché local del documento
                    const vpgProfile = {
                        username: userData.username || null,
                        psn: userData.psn || null,
                        origin: userData.origin || null,
                        xbox: userData.xbox || null,
                        lastChecked: new Date()
                    };
                    await playerColl.updateOne({ _id: mainPlayer._id }, { $set: { vpgProfile } });
                    
                    const consoleIds = [
                        String(userData.username || ''),
                        String(userData.psn || ''),
                        String(userData.origin || ''),
                        String(userData.xbox || '')
                    ].map(id => id.toLowerCase().trim()).filter(Boolean);
                    
                    if (consoleIds.includes(dupPlayer.eaPlayerName.toLowerCase().trim())) {
                        verified = true;
                    }
                } else {
                    console.warn(`[VPG SYNC] [MERGE] Error HTTP consultando API para ${mainPlayer.eaPlayerName}: ${res.status}`);
                }
            } catch (err) {
                console.error(`[VPG SYNC] [MERGE] Error llamando a API VPG para ${mainPlayer.eaPlayerName}:`, err.message);
            }
        }

        // Ejecutar fusión si ha sido confirmado
        if (verified) {
            console.log(`[VPG SYNC] [MERGE] ¡FUSIÓN CONFIRMADA! Fusionando ${dupPlayer.eaPlayerName} en ${mainPlayer.eaPlayerName}...`);
            try {
                await mergePlayerProfiles(db, mainPlayer.eaPlayerName, dupPlayer.eaPlayerName);
                mergedCount++;
            } catch (err) {
                console.error(`[VPG SYNC] [MERGE] Error ejecutando la fusión:`, err);
            }
        }
    }
    
    console.log(`[VPG SYNC] [MERGE] Detección y fusión de duplicados finalizada. Fusionados ${mergedCount} perfiles en este ciclo.`);
}


