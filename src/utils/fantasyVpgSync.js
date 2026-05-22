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
    const posUpper = (p.lastPosition || '').toUpperCase();
    const isGk = posUpper === 'POR' || posUpper === 'GK';

    if (p.manualPrice !== undefined && p.manualPrice !== null) {
        price = p.manualPrice;
        if (isGk) {
            price *= 2;
        }
        price *= 5.33333333;
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
    }

    // Límites y Redondeo
    price = Math.min(80000000, Math.max(2600000, price));
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
                    rewardAmount = deltaPoints * 80000;
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

        // 6. Procesar y adjudicar pujas a ciegas de agentes libres
        try {
            updateRebuildStatus({ progress: 'Resolviendo pujas de agentes libres...' });
            const leaguesList = await db.collection('fantasy_leagues').find().toArray();
            for (const lDoc of leaguesList) {
                await resolveFreeAgentBids(db, lDoc);
            }
        } catch (e) {
            console.error('[VPG SYNC] Error al resolver pujas de agentes libres:', e);
        }

        // 7. Regenerar el mercado de agentes libres de la liga para el día siguiente
        try {
            updateRebuildStatus({ progress: 'Regenerando mercado de agentes libres...' });
            const leaguesList = await db.collection('fantasy_leagues').find().toArray();
            for (const lDoc of leaguesList) {
                await generateMarketFreeAgentsPool(db, lDoc);
            }
        } catch (e) {
            console.error('[VPG SYNC] Error al regenerar mercado de agentes libres:', e);
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

            if (isPlayerEligibleForSlot(player.lastPosition, slot.key, formation, slot.index)) {
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
            lastPosition: p.lastPosition || 'MC',
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
        // Individual player price must not exceed 40M
        if (p.price > 40000000) return false;
        return true;
    });

    // Partition available pool by position constraints
    const poolPOR = pool.filter(p => isGoalkeeper(p.lastPosition));
    const poolCB = pool.filter(p => isCentralDefender(p.lastPosition));
    const poolDC = pool.filter(p => p.lastPosition === 'DC');
    const poolMCStrict = pool.filter(p => ['MC', 'MCD', 'MCO'].includes(p.lastPosition));
    const poolCARR = pool.filter(p => isLateral(p.lastPosition));

    // Validate that we have enough candidates in the database
    if (poolPOR.length < 1 || poolCB.length < 3 || poolDC.length < 2 || poolMCStrict.length < 3 || poolCARR.length < 3) {
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

        // 1. Pick minimum required ones
        const gks = pickFromPool(poolPOR, 1);
        const cbs = pickFromPool(poolCB, 3);
        const dcs = pickFromPool(poolDC, 2);
        const mcs = pickFromPool(poolMCStrict, 3);
        const carrs = pickFromPool(poolCARR, 3);

        if (!gks || !cbs || !dcs || !mcs || !carrs) {
            continue;
        }

        currentSquad.push(...gks, ...cbs, ...dcs, ...mcs, ...carrs); // 12 players

        // 2. Pick remaining 3 players from the rest of the pool
        const restPool = pool.filter(p => !usedNames.has(p.eaPlayerName));
        const extra = pickFromPool(restPool, 3);
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
            lastPosition: p.lastPosition || 'MC',
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
            if (team && team.approved && (team.players || []).length < (leagueDoc.maxSquadSize || 15)) {
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
