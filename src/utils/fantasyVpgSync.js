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
    if (p.manualPrice !== undefined && p.manualPrice !== null) {
        price = p.manualPrice;
    } else {
        price = 1000000;
        price += (stats.goals || 0) * 250000;
        price += (stats.assists || 0) * 200000;
        const posUpper = (p.lastPosition || '').toUpperCase();
        const isDefOrGk = ['POR', 'DFC', 'LD', 'LI', 'CAD', 'CAI', 'CARR'].includes(posUpper);
        if (isDefOrGk) price += (stats.cleanSheets || 0) * 150000;
        
        // Ajustes por victorias/derrotas de equipo en el valor
        price += (stats.wins || 0) * 50000;
        price -= (stats.losses || 0) * 25000;

        if (avgRating > 6.0) price *= (1 + (avgRating - 6.0) * 0.5);
        price = Math.min(15000000, Math.max(500000, price));
        price = Math.round(price / 10000) * 10000;
    }

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

        // B. Calcular puntos previos de los equipos de Fantasy antes de que cambien los stats de los jugadores
        console.log('[VPG SYNC] Calculando puntos previos de los equipos de Fantasy...');
        const teamOldPoints = {};
        try {
            const leaguesList = await db.collection('fantasy_leagues').find().toArray();
            const leaguesMap = {};
            leaguesList.forEach(l => {
                leaguesMap[l._id.toString()] = l;
            });
            const fantasyTeamsList = await db.collection('fantasy_teams').find().toArray();
            for (const fTeam of fantasyTeamsList) {
                let oldTeamPoints = 0;
                const league = leaguesMap[fTeam.leagueId];
                for (const playerName of (fTeam.players || [])) {
                    const player = await playerColl.findOne({ 
                        eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } 
                    });
                    if (player) {
                        const { points: rawPoints } = calculatePlayerPointsAndPrice(player);
                        let playerPoints = rawPoints;
                        if (league && league.pointsMode === 'zero' && league.basePoints) {
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
                            playerPoints = Math.max(0, Math.round((rawPoints - base) * 10) / 10);
                        }
                        oldTeamPoints += playerPoints;
                    }
                }
                oldTeamPoints = Math.round(oldTeamPoints * 10) / 10;
                teamOldPoints[fTeam._id.toString()] = oldTeamPoints;
            }
            console.log('[VPG SYNC] Puntos previos calculados exitosamente.');
        } catch (e) {
            console.error('[VPG SYNC] Error calculando puntos previos:', e);
        }

        // 3. Procesar cada liga activa
        for (const leagueSlug of activeLeagues) {
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
            for (const [vpgPosKey, fantasyPos] of Object.entries(LEADERBOARD_POS_MAP)) {
                let offset = 0;
                let hasMore = true;
                let posPlayersCount = 0;

                while (hasMore) {
                    updateRebuildStatus({ progress: `Descargando líderes de ${leagueSlug} para ${fantasyPos} (offset: ${offset})...` });

                    const leaderboardUrl = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&limit=30&offset=${offset}`;
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

                            // Crear stats objeto compatible
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

                            const updateData = {
                                lastClub: dbTeam ? dbTeam.name : (player.team_name || player.team_slug || "VPG Club"),
                                lastActive: new Date(),
                                lastPosition: fantasyPos,
                                vpgLeagueSlug: leagueSlug,
                                stats: playerStats
                            };

                            // Buscar jugador por eaPlayerName case-insensitively
                            const existingPlayer = await playerColl.findOne({ 
                                eaPlayerName: { $regex: new RegExp('^' + username.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } 
                            });

                            if (existingPlayer) {
                                await playerColl.updateOne(
                                    { _id: existingPlayer._id },
                                    { $set: updateData }
                                );
                            } else {
                                // Insertar nuevo jugador
                                await playerColl.insertOne({
                                    eaPlayerName: username,
                                    ...updateData,
                                    build: {
                                        height: null,
                                        weight: null,
                                        perks: {},
                                        vproattr: "NH"
                                    }
                                });
                            }

                            totalPlayersUpdated++;
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
        }

        // 4. Recalcular puntos de los equipos Fantasy de cada liga
        updateRebuildStatus({ progress: 'Recalculando puntos de ligas y equipos de Fantasy...' });
        const leagues = await db.collection('fantasy_leagues').find().toArray();
        for (const league of leagues) {
            const fantasyTeams = await db.collection('fantasy_teams').find({ leagueId: league._id.toString() }).toArray();
            for (const fTeam of fantasyTeams) {
                let totalPoints = 0;
                for (const playerName of (fTeam.players || [])) {
                    const player = await playerColl.findOne({ 
                        eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } 
                    });
                    if (player) {
                        const { points: rawPoints } = calculatePlayerPointsAndPrice(player);
                        let playerPoints = rawPoints;
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
                            playerPoints = Math.max(0, Math.round((rawPoints - base) * 10) / 10);
                        }
                        totalPoints += playerPoints;
                    }
                }
                totalPoints = Math.round(totalPoints * 10) / 10;

                // Calcular ganancias para el mánager por la jornada
                const oldPoints = teamOldPoints[fTeam._id.toString()] !== undefined ? teamOldPoints[fTeam._id.toString()] : totalPoints;
                const deltaPoints = totalPoints - oldPoints;
                let rewardAmount = 0;
                const updateDoc = { $set: { points: totalPoints } };

                if (deltaPoints > 0) {
                    const budget = league.initialBudget || 50000000;
                    // Factor de recompensa: 0.005% del presupuesto inicial por punto ganado
                    rewardAmount = deltaPoints * Math.round(budget * 0.00005);
                    if (rewardAmount > 0) {
                        updateDoc.$inc = { balance: rewardAmount };
                    }
                }

                await db.collection('fantasy_teams').updateOne({ _id: fTeam._id }, updateDoc);

                if (rewardAmount > 0) {
                    console.log(`[VPG SYNC] El equipo ${fTeam.teamName} ha ganado ${rewardAmount.toLocaleString('es-ES')} € por ${deltaPoints} puntos en esta jornada.`);
                }
            }
        }

        // 5. Procesar ofertas de compra de la liga para jugadores transferibles
        try {
            updateRebuildStatus({ progress: 'Procesando ofertas automáticas de La Liga...' });
            await processLeagueMarketOffers(db);
        } catch (e) {
            console.error('[VPG SYNC] Error al procesar ofertas de la liga:', e);
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
        // Fallback si createdAt no existe
        const createdAt = listing.createdAt ? new Date(listing.createdAt) : now;
        const elapsedMs = now - createdAt;
        const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

        if (elapsedDays < 2) {
            continue; // Menos de 2 días
        }

        // Buscar el perfil del jugador
        const player = await playerColl.findOne({
            eaPlayerName: { $regex: new RegExp('^' + listing.eaPlayerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        });
        if (!player) {
            console.warn(`[LEAGUE MARKET OFFER] No se encontró perfil para el jugador listado: ${listing.eaPlayerName}`);
            continue;
        }

        const { price } = calculatePlayerPointsAndPrice(player);

        let targetOffer;
        let tier;
        if (elapsedDays >= 4) {
            targetOffer = Math.round(price * 0.20); // Valor menos 80% (20% del valor)
            tier = 2;
        } else {
            targetOffer = Math.round(price * 0.25); // Valor menos 75% (25% del valor)
            tier = 1;
        }

        // Buscar puja de la liga existente
        const existingBid = await db.collection('fantasy_market_bids').findOne({
            leagueId: listing.leagueId,
            eaPlayerName: listing.eaPlayerName,
            bidderDiscordId: 'liga'
        });

        if (!existingBid) {
            // Crear nueva puja de la liga
            await db.collection('fantasy_market_bids').insertOne({
                leagueId: listing.leagueId,
                bidderDiscordId: 'liga',
                bidderTeamName: 'La Liga',
                sellerDiscordId: listing.sellerDiscordId,
                sellerTeamName: listing.sellerTeamName,
                eaPlayerName: listing.eaPlayerName,
                bidAmount: targetOffer,
                tier: tier,
                status: 'pending',
                createdAt: new Date()
            });
            console.log(`[LEAGUE MARKET OFFER] Nueva oferta de La Liga creada para ${listing.eaPlayerName} por ${targetOffer.toLocaleString('es-ES')} € (Tier ${tier})`);
        } else {
            // Si el tier ha cambiado, actualizamos la oferta
            if (existingBid.tier !== tier) {
                await db.collection('fantasy_market_bids').updateOne(
                    { _id: existingBid._id },
                    {
                        $set: {
                            bidAmount: targetOffer,
                            tier: tier,
                            status: 'pending',
                            createdAt: new Date()
                        }
                    }
                );
                console.log(`[LEAGUE MARKET OFFER] Oferta de La Liga para ${listing.eaPlayerName} actualizada a ${targetOffer.toLocaleString('es-ES')} € (Tier ${tier})`);
            }
        }
    }
}

