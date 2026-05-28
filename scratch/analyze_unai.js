import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== ANÁLISIS DEL JUGADOR: unaiiigarciiiaa_ ===\n');
        
        const playerName = 'unaiiigarciiiaa_';
        
        // 1. Obtener perfil del jugador
        const player = await db.collection('player_profiles').findOne({
            eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        });
        
        if (!player) {
            console.log(`No se encontró el jugador "${playerName}" en player_profiles.`);
            return;
        }
        
        console.log(`Nombre EA: ${player.eaPlayerName}`);
        console.log(`Nacionalidad: ${player.nationality || 'N/A'}`);
        console.log(`Última Posición: ${player.lastPosition || 'N/A'}`);
        console.log(`Último Club VPG: ${player.lastClub || 'N/A'} (Slug de equipo: ${player.vpgTeamSlug || 'Sin equipo'})`);
        console.log(`Liga VPG actual: ${player.vpgLeagueSlug || 'Sin liga asignada'}`);
        console.log(`Última vez activo: ${player.lastActive ? new Date(player.lastActive).toLocaleString('es-ES') : 'N/A'}`);
        console.log('----------------------------------------------------');
        
        // 2. Calcular precio y promedio de valoración dinámico
        const calc = calculatePlayerPointsAndPrice(player);
        console.log('--- CÁLCULO DE VALOR DE MERCADO Y PUNTOS ---');
        console.log(`Puntos VPG acumulados: ${calc.points}`);
        console.log(`Valoración Media (Rating): ${calc.avgRating.toFixed(2)}`);
        console.log(`Valor de Mercado Fantasy: ${calc.price.toLocaleString('es-ES')} €`);
        console.log('----------------------------------------------------');
        
        // 3. Buscar si tiene propietario en la liga Fantasy
        console.log('--- SITUACIÓN EN EL FANTASY ---');
        const ownerTeam = await db.collection('fantasy_teams').findOne({
            players: { $regex: new RegExp('^' + player.eaPlayerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        });
        
        if (ownerTeam) {
            console.log(`Estado: PROPIEDAD DE UN EQUIPO`);
            console.log(`Equipo Fantasy: ${ownerTeam.teamName} (${ownerTeam.discordUsername || 'Sin Discord username'})`);
            
            // Buscar cláusula en el objeto de cláusulas del equipo
            const clauses = ownerTeam.clauses || {};
            const matchClauseKey = Object.keys(clauses).find(k => k.toLowerCase() === player.eaPlayerName.toLowerCase());
            const clauseVal = matchClauseKey ? clauses[matchClauseKey] : null;
            console.log(`Cláusula de Rescisión: ${clauseVal ? clauseVal.toLocaleString('es-ES') + ' €' : 'No definida'}`);
            
            // Buscar protección contra robos
            const protectedUntil = ownerTeam.clausesProtectedUntil || {};
            const matchProtectKey = Object.keys(protectedUntil).find(k => k.toLowerCase() === player.eaPlayerName.toLowerCase());
            const protectionExpiry = matchProtectKey ? protectedUntil[matchProtectKey] : null;
            if (protectionExpiry) {
                const expiryDate = new Date(protectionExpiry);
                const now = new Date();
                const isStillProtected = expiryDate > now;
                console.log(`Protección de cláusula: Hasta el ${expiryDate.toLocaleString('es-ES')} (${isStillProtected ? 'ACTIVA' : 'EXPIRADA'})`);
            } else {
                console.log(`Protección de cláusula: No protegido`);
            }
        } else {
            console.log(`Estado: JUGADOR LIBRE (Sin propietario en el Fantasy)`);
            const defaultClauseMultiplier = 1.5; // Estimación estándar
            const estimatedClause = Math.round(calc.price * defaultClauseMultiplier);
            console.log(`Cláusula estimada si se ficha: ~${estimatedClause.toLocaleString('es-ES')} €`);
        }
        console.log('----------------------------------------------------');
        
        // 4. Estadísticas detalladas de rendimiento
        console.log('--- ESTADÍSTICAS EN LIGA ---');
        const stats = player.stats || {};
        console.log(`Partidos Jugados: ${stats.matchesPlayed || 0}`);
        console.log(`Goles: ${stats.goals || 0}`);
        console.log(`Asistencias: ${stats.assists || 0}`);
        console.log(`Porterías a Cero (Clean Sheets): ${stats.cleanSheets || 0}`);
        console.log(`Victorias: ${stats.wins || 0}`);
        console.log(`Derrotas: ${stats.losses || 0}`);
        console.log(`Empates: ${stats.ties || 0}`);
        console.log('----------------------------------------------------');
        
        // 5. Historial reciente en partidos escaneados
        console.log('--- ÚLTIMOS PARTIDOS DETECTADOS EN BD (scanned_matches) ---');
        
        // Busquemos en todos los partidos recientes de la base de datos (últimos 300 partidos)
        const allRecentMatches = await db.collection('scanned_matches')
            .find({})
            .sort({ timestamp: -1, date: -1 })
            .limit(300)
            .toArray();
            
        const matches = [];
        for (const m of allRecentMatches) {
            let foundInMatch = false;
            
            const checkPlayers = (playersObjOrArray) => {
                if (!playersObjOrArray) return false;
                if (Array.isArray(playersObjOrArray)) {
                    return playersObjOrArray.some(p => p.playername?.toLowerCase() === player.eaPlayerName.toLowerCase());
                } else {
                    return Object.values(playersObjOrArray).some(p => p.playername?.toLowerCase() === player.eaPlayerName.toLowerCase());
                }
            };
            
            if (checkPlayers(m.clubA?.players) || checkPlayers(m.clubB?.players)) {
                matches.push(m);
            }
            if (matches.length >= 5) break; // Solo queremos los 5 más recientes
        }
        
        if (matches.length > 0) {
            console.log(`Encontrados ${matches.length} partidos recientes:`);
            matches.forEach(m => {
                const dateStr = m.timestamp ? new Date(m.timestamp).toLocaleString('es-ES') : (m.date ? new Date(m.date).toLocaleString('es-ES') : 'Fecha desconocida');
                const homeName = m.clubA?.name || m.homeTeam?.name || 'Local';
                const awayName = m.clubB?.name || m.awayTeam?.name || 'Visitante';
                const homeScore = m.clubA?.score ?? m.homeTeam?.score ?? '?';
                const awayScore = m.clubB?.score ?? m.awayTeam?.score ?? '?';
                
                // Encontrar su rating en este partido
                let rating = 'N/A';
                let goals = 0;
                let assists = 0;
                
                const searchPlayerStats = (playersObjOrArray) => {
                    if (!playersObjOrArray) return;
                    if (Array.isArray(playersObjOrArray)) {
                        const pFound = playersObjOrArray.find(p => p.playername?.toLowerCase() === player.eaPlayerName.toLowerCase());
                        if (pFound) {
                            rating = pFound.rating || 'N/A';
                            goals = pFound.goals || 0;
                            assists = pFound.assists || 0;
                        }
                    } else {
                        // Es un objeto indexado por id
                        Object.values(playersObjOrArray).forEach(p => {
                            if (p.playername?.toLowerCase() === player.eaPlayerName.toLowerCase()) {
                                rating = p.rating || 'N/A';
                                goals = p.goals || 0;
                                assists = p.assists || 0;
                            }
                        });
                    }
                };
                
                searchPlayerStats(m.clubA?.players);
                searchPlayerStats(m.clubB?.players);
                
                console.log(`- [${dateStr}] ${homeName} ${homeScore} - ${awayScore} ${awayName} | Rating: ${rating} | Goles: ${goals} | Asistencias: ${assists}`);
            });
        } else {
            console.log('No se registraron partidos individuales recientes en scanned_matches para este jugador.');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
