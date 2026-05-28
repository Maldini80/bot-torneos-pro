// scratch/simulate_sync.js
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Configuración de VPG Headers
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

async function simulateSync() {
    console.log('====================================================');
    console.log('🎮 SIMULACIÓN EN SECO (DRY-RUN) DEL REPARTO DE PUNTOS');
    console.log('====================================================');
    console.log('[PROCESANDO...] Conectando a MongoDB Atlas...');

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('ERROR: DATABASE_URL no encontrada en el .env');
        return;
    }

    const client = new MongoClient(dbUrl);
    
    // Almacén para el informe final
    const reportLines = [];
    const log = (msg) => {
        console.log(msg);
        reportLines.push(msg);
    };

    log(`Inicio de simulación: ${new Date().toLocaleString('es-ES')}`);

    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const testDb = client.db('test');

        log('[OK] Conexión establecida. Iniciando consultas en modo LECTURA...');

        // 1. Obtener ligas activas del Fantasy
        let activeLeagues = [];
        const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
        if (config && Array.isArray(config.slugs)) {
            activeLeagues = config.slugs;
        } else {
            activeLeagues = ["superliga-spain-a", "superliga-spain-b"]; // fallback
        }
        log(`[INFO] Ligas VPG activas detectadas: ${activeLeagues.join(', ')}`);

        // 2. Obtener equipos de la BD correspondientes a estas ligas
        const dbTeams = await testDb.collection('teams').find({ vpgLeagueSlug: { $in: activeLeagues } }).toArray();
        log(`[INFO] Cargados ${dbTeams.length} equipos de clubes de la DB de VPG.`);

        // 3. Cargar todos los puntos VPG actuales en memoria para calcular incrementos (Deltas)
        log('[INFO] Cargando perfiles de jugadores para calcular deltas...');
        const playerProfilesMap = new Map();
        const allPlayers = await db.collection('player_profiles').find({}, { projection: { eaPlayerName: 1, vpgTeamSlug: 1, vpgLeagueSlug: 1, stats: 1 } }).toArray();
        allPlayers.forEach(p => {
            if (p.eaPlayerName) {
                playerProfilesMap.set(p.eaPlayerName.toLowerCase(), p);
            }
        });
        log(`[INFO] Cargados perfiles en BD para ${playerProfilesMap.size} jugadores.`);

        // Estructuras para acumular deltas y cálculos en memoria
        const playerDeltas = new Map(); // eaPlayerName -> { oldPoints, newPoints, delta }
        const leaguePlayersMap = new Map(); // username -> stats

        // 4. Descargar tablas de clasificación (standings) y líderes desde VPG
        for (const leagueSlug of activeLeagues) {
            log(`\n--- PROCESANDO LIGA VPG: ${leagueSlug} ---`);
            
            // A. Obtener clasificación de VPG
            const tableUrl = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/table/`;
            let standings = [];
            try {
                const res = await fetch(tableUrl, { headers: HEADERS });
                if (res.ok) {
                    const data = await res.json();
                    standings = Array.isArray(data) ? data : (data.data || data.results || []);
                }
            } catch (e) {
                log(`[!] Error al obtener la tabla de clasificación de ${leagueSlug}: ${e.message}`);
            }

            log(`[VPG API] Clasificación obtenida: ${standings.length} equipos.`);

            const teamStandingsMap = new Map();
            for (const vpgTeam of standings) {
                const teamSlugLower = String(vpgTeam.team_slug || '').toLowerCase().trim();
                const teamNameLower = String(vpgTeam.team_name || '').toLowerCase().trim();
                if (teamSlugLower) teamStandingsMap.set(teamSlugLower, vpgTeam);
                if (teamNameLower) teamStandingsMap.set(teamNameLower, vpgTeam);
            }

            // B. Descargar líderes de posición (goleadores, porteros, etc.) de VPG
            for (const [vpgPosKey, fantasyPos] of Object.entries(LEADERBOARD_POS_MAP)) {
                let offset = 0;
                let hasMore = true;
                let posPlayersCount = 0;

                while (hasMore) {
                    const leaderboardUrl = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&type=all&limit=30&offset=${offset}`;
                    let pagePlayers = [];
                    try {
                        const res = await fetch(leaderboardUrl, { headers: HEADERS });
                        if (res.ok) {
                            const data = await res.json();
                            pagePlayers = data.data || [];
                            if (!Array.isArray(pagePlayers) || pagePlayers.length < 30) {
                                hasMore = false;
                            }
                        } else {
                            console.error(`[API ERROR] Leaderboard ${vpgPosKey} returned HTTP ${res.status}`);
                            hasMore = false;
                        }
                    } catch (e) {
                        console.error(`[FETCH ERROR] Failed fetching ${vpgPosKey}: ${e.message}`);
                        hasMore = false;
                    }

                    if (pagePlayers.length > 0) {
                        posPlayersCount += pagePlayers.length;
                        for (const player of pagePlayers) {
                            const username = player.username;
                            if (!username) continue;
                            const usernameLower = username.toLowerCase();

                            const played = player.matches_played || 0;
                            const newVpgPoints = parseFloat(player.points) || 0;

                            // Calcular el delta usando la lógica general
                            const existingPlayer = playerProfilesMap.get(usernameLower);
                            let delta = 0;
                            let oldVpgPoints = 0;

                            if (existingPlayer) {
                                // Simular la resolución de conflictos: si el jugador está registrado en otra división activa, omitimos
                                if (existingPlayer.vpgLeagueSlug && existingPlayer.vpgLeagueSlug !== leagueSlug) {
                                    continue;
                                }

                                const pSlug = player.team_slug || '';
                                const pSlugNormalized = String(pSlug).toLowerCase().trim();
                                const dbSlugNormalized = String(existingPlayer.vpgTeamSlug || '').toLowerCase().trim();
                                const hasTransferred = dbSlugNormalized && pSlugNormalized && dbSlugNormalized !== pSlugNormalized;

                                const lastRaw = hasTransferred ? {} : (existingPlayer.stats?.vpgLastRaw || existingPlayer.stats || {});
                                delta = Math.max(0, Math.round((newVpgPoints - (parseFloat(lastRaw.vpgPoints) || 0)) * 10) / 10);
                                oldVpgPoints = existingPlayer.stats?.vpgPoints || 0;
                            } else {
                                delta = newVpgPoints;
                            }

                            if (delta > 0) {
                                playerDeltas.set(usernameLower, {
                                    eaPlayerName: username,
                                    oldPoints: oldVpgPoints,
                                    newPoints: oldVpgPoints + delta,
                                    delta: delta,
                                    club: player.team_name || 'VPG Club'
                                });
                            }

                            // Añadir al mapa de la liga
                            leaguePlayersMap.set(usernameLower, {
                                eaPlayerName: username,
                                lastPosition: fantasyPos,
                                vpgLeagueSlug: leagueSlug,
                                points: oldVpgPoints + delta
                            });
                        }
                    }


                    offset += 30;
                    if (offset >= 1200) hasMore = false; // Límite de seguridad
                }
                log(`[VPG API] Líderes para ${vpgPosKey} procesados: ${posPlayersCount} jugadores.`);
            }
        }

        log(`\n[INFO] Simulación del cálculo de deltas completada.`);
        log(`[INFO] Jugadores que sumarán puntos hoy: ${playerDeltas.size}`);

        // Mostrar top 10 jugadores con más deltas hoy
        if (playerDeltas.size > 0) {
            log('\n--- TOP 15 JUGADORES CON MÁS DELTAS DE PUNTOS HOY ---');
            const sortedDeltas = Array.from(playerDeltas.values()).sort((a, b) => b.delta - a.delta);
            sortedDeltas.slice(0, 15).forEach((p, idx) => {
                log(`${idx + 1}. ${p.eaPlayerName} (${p.club}): anterior: ${p.oldPoints} pts -> actual: ${p.newPoints} pts (Delta: +${p.delta} pts)`);
            });
        } else {
            log('\n[INFO] No hay deltas de puntos calculados (los puntos actuales en VPG son iguales a los guardados en BD).');
        }

        // 5. Procesar las Ligas Fantasy y sus equipos
        log('\n====================================================');
        log('🏆 CÁLCULO DE REPARTO DE PUNTOS PARA LAS LIGAS FANTASY');
        log('====================================================');

        const fantasyLeagues = await db.collection('fantasy_leagues').find({ status: { $ne: 'closed' } }).toArray();
        log(`[INFO] Encontradas ${fantasyLeagues.length} ligas de Fantasy activas.`);

        let totalTeamsProcessed = 0;

        for (const league of fantasyLeagues) {
            const leagueIdStr = league._id.toString();
            log(`\n----------------------------------------------------`);
            log(`Liga Fantasy: ${league.name} (Modo: ${league.pointsMode.toUpperCase()})`);
            log(`----------------------------------------------------`);

            const teams = await db.collection('fantasy_teams').find({ leagueId: leagueIdStr }).toArray();
            log(`[INFO] Liga tiene ${teams.length} equipos participantes.`);

            for (const team of teams) {
                totalTeamsProcessed++;
                const lineup = team.lineup || {};
                let teamPointsSum = 0;
                const details = [];

                // Lista de jugadores en la alineación titular (POR, DFC, MC, DC)
                const starters = [];
                if (lineup.POR) starters.push(lineup.POR);
                if (Array.isArray(lineup.DFC)) starters.push(...lineup.DFC.filter(Boolean));
                if (Array.isArray(lineup.MC)) starters.push(...lineup.MC.filter(Boolean));
                if (Array.isArray(lineup.DC)) starters.push(...lineup.DC.filter(Boolean));

                for (const pName of starters) {
                    const pNameLower = pName.toLowerCase();
                    const deltaInfo = playerDeltas.get(pNameLower);
                    
                    if (deltaInfo) {
                        teamPointsSum += deltaInfo.delta;
                        details.push(`${pName} (+${deltaInfo.delta} pts)`);
                    }
                }

                // Si la liga tiene multiplicador o premios monetarios por punto
                const pointsValue = league.pointsValue || 100000; // Valor por defecto 100k por punto
                const moneyReward = Math.round(teamPointsSum * pointsValue);

                if (teamPointsSum > 0) {
                    log(`👉 Equipo: "${team.teamName}" (${team.discordUsername})`);
                    log(`   Puntos que sumará hoy: +${Math.round(teamPointsSum * 10) / 10} pts`);
                    log(`   Premio económico que ganará: +${moneyReward.toLocaleString('es-ES')} €`);
                    log(`   Jugadores que aportaron: ${details.join(', ')}`);
                } else {
                    log(`👉 Equipo: "${team.teamName}" (${team.discordUsername}) -> 0 puntos hoy (ningún jugador activo sumó puntos).`);
                }
            }
        }

        log(`\n====================================================`);
        log(`[OK] SIMULACIÓN COMPLETADA SIN ERRORES.`);
        log(`Total de equipos analizados: ${totalTeamsProcessed}`);
        log(`====================================================`);

    } catch (error) {
        log(`\n[CRITICAL ERROR] Error en la simulación: ${error.message}`);
        console.error(error);
    } finally {
        await client.close();
        log('\n[INFO] Conexión de base de datos cerrada de forma segura.');
        
        // Guardar el reporte en un archivo físico para que quede registro
        try {
            const fs = await import('fs');
            fs.writeFileSync('scratch/resultado_simulacion.txt', reportLines.join('\n'), 'utf-8');
            console.log('\n[ARCHIVO] Se ha guardado el reporte completo en: scratch/resultado_simulacion.txt');
        } catch (fsErr) {
            console.error('No se pudo escribir el archivo de reporte:', fsErr.message);
        }
    }
}

// Ejecutar la simulación
simulateSync();
