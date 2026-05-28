import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== INVESTIGACIÓN: TEAM NITRO EN LIGA JAM ===\n');
        
        // 1. Encontrar el equipo
        const team = await db.collection('fantasy_teams').findOne({
            teamName: { $regex: /nitro/i }
        });
        
        if (!team) {
            console.log('No se encontró ningún equipo con "nitro" en el nombre.');
            return;
        }
        
        console.log(`Equipo encontrado: "${team.teamName}"`);
        console.log(`ID de Liga: ${team.leagueId}`);
        console.log(`Puntos Totales: ${team.points}`);
        console.log(`Plantilla (players):`, team.players);
        console.log(`Alineación (lineup):`, JSON.stringify(team.lineup, null, 2));
        console.log('----------------------------------------------------');
        
        // Obtener la liga para saber las basePoints si es pointsMode = 'zero'
        const league = await db.collection('fantasy_leagues').findOne({
            _id: team.leagueId ? (typeof team.leagueId === 'string' ? team.leagueId : team.leagueId) : null
        });
        const pointsMode = league ? league.pointsMode : 'N/A';
        console.log(`Liga: "${league?.name || 'N/A'}" | Modo de puntos: ${pointsMode}`);
        console.log('----------------------------------------------------');

        // 2. Analizar a cada uno de los jugadores mencionados
        const playersToInspect = [
            // Listados en la imagen
            'xValdes77', 'EdwardSG', 'Valdi_17', 'bojan_9000', 'l-Maximinl0', 'satitajr',
            // Dijo que faltan
            'raven', 'juan lukaku', 'eurex'
        ];
        
        console.log('--- ANÁLISIS DE JUGADORES ---');
        for (const pName of playersToInspect) {
            const playerDoc = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            
            if (!playerDoc) {
                // Si no hay exacto, busquemos coincidencia parcial
                const partial = await db.collection('player_profiles').find({
                    eaPlayerName: { $regex: new RegExp(pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }
                }).toArray();
                
                console.log(`\nJugador: "${pName}" -> ❌ NO ENCONTRADO EXACTO.`);
                if (partial.length > 0) {
                    console.log(`   Coincidencias parciales en BD:`, partial.map(x => `${x.eaPlayerName} (VPG Team: ${x.vpgTeamSlug})`));
                }
                continue;
            }
            
            const calc = calculatePlayerPointsAndPrice(playerDoc);
            
            // Ver si está en la plantilla
            const inSquad = team.players.map(x => x.toLowerCase()).includes(playerDoc.eaPlayerName.toLowerCase());
            
            // Ver si está en la alineación titular
            let isStarter = false;
            let alignedPosition = 'No alineado';
            if (team.lineup) {
                if (team.lineup.POR && team.lineup.POR.toLowerCase() === playerDoc.eaPlayerName.toLowerCase()) {
                    isStarter = true;
                    alignedPosition = 'POR';
                }
                ['DFC', 'MC', 'DC'].forEach(pos => {
                    if (Array.isArray(team.lineup[pos])) {
                        const idx = team.lineup[pos].findIndex(x => x && x.toLowerCase() === playerDoc.eaPlayerName.toLowerCase());
                        if (idx !== -1) {
                            isStarter = true;
                            alignedPosition = `${pos} [índice ${idx}]`;
                        }
                    }
                });
            }
            
            // Puntos de liga calculados según el modo de puntos
            let calculatedPoints = calc.points;
            let base = 0;
            if (league && league.pointsMode === 'zero' && league.basePoints) {
                const playerNameLower = playerDoc.eaPlayerName.toLowerCase();
                if (league.basePoints[playerDoc.eaPlayerName] !== undefined) {
                    base = league.basePoints[playerDoc.eaPlayerName];
                } else {
                    const foundKey = Object.keys(league.basePoints).find(k => k.toLowerCase() === playerNameLower);
                    if (foundKey !== undefined) {
                        base = league.basePoints[foundKey];
                    }
                }
                calculatedPoints = Math.max(0, Math.round((calc.points - base) * 10) / 10);
            }
            
            console.log(`\nJugador: "${playerDoc.eaPlayerName}"`);
            console.log(`   Posición Real: ${playerDoc.lastPosition || 'N/A'} | Club VPG: ${playerDoc.lastClub || 'Sin Club'}`);
            console.log(`   ¿En plantilla (squad)?: ${inSquad ? '✅ SÍ' : '❌ NO'}`);
            console.log(`   ¿Alineado titular?: ${isStarter ? '✅ SÍ (' + alignedPosition + ')' : '❌ NO'}`);
            console.log(`   Puntos Totales VPG: ${calc.points} | BasePoints de Liga: ${base} | Puntos Calculados en Liga: ${calculatedPoints}`);
            console.log(`   Stats del jugador: PJ: ${playerDoc.stats?.matchesPlayed || 0} | Goles: ${playerDoc.stats?.goals || 0} | Asistencias: ${playerDoc.stats?.assists || 0}`);
            
            // Ver si hay registro de su última actualización (vpgLastRawPerLeague o vpgLastRaw)
            const raw = playerDoc.stats?.vpgLastRawPerLeague?.[playerDoc.vpgLeagueSlug] || playerDoc.stats?.vpgLastRaw || {};
            console.log(`   Último raw en BD: PJ: ${raw.matchesPlayed || 0} | Puntos VPG: ${raw.vpgPoints || 0}`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
