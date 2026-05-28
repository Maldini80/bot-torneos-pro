import { connectDb, getDb } from '../database.js';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    await connectDb();
    const db = getDb();
    
    // We will define the list of anomalies we found
    const anomaliesToProcess = [
        { playerName: "Nus_tony", vpgPoints: 61.7 },
        { playerName: "DavisReus999", vpgPoints: 152.0 },
        { playerName: "benavente_twelwe", vpgPoints: 173.2 },
        { playerName: "zzRaydenzz", vpgPoints: 75.1 },
        { playerName: "woodydomiguez", vpgPoints: 92.3 },
        { playerName: "FlouZen", vpgPoints: 135.0 },
        { playerName: "itamargabarre9", vpgPoints: 78.8 },
        { playerName: "MessirveGod", vpgPoints: 169.5 },
        { playerName: "Bledaa25", vpgPoints: 133.8 },
        { playerName: "Jon_AM19", vpgPoints: 69.8 },
        { playerName: "ElconquistadorTW", vpgPoints: 145.8 },
        { playerName: "Noahliciousfit", vpgPoints: 46.7 },
        { playerName: "adri6mate", vpgPoints: 62.2 },
        { playerName: "Killer_tobar", vpgPoints: 31.7 },
        { playerName: "Heernaaiiiz", vpgPoints: 192.3 },
        { playerName: "soyleyenda2308", vpgPoints: 235.1 },
        { playerName: "ermoybanjo", vpgPoints: 101.9 },
        { playerName: "PedroG_7", vpgPoints: 226.3 },
        { playerName: "GipsyFavela", vpgPoints: 46.1 },
        { playerName: "Hectorhr21", vpgPoints: 235.2 },
        { playerName: "SoyPat", vpgPoints: 82.9 },
        { playerName: "sadikito_0519", vpgPoints: 34.1 },
        { playerName: "not_ven00m", vpgPoints: 75.8 },
        { playerName: "xFuture 11", vpgPoints: 81.9 },
        { playerName: "raullud__", vpgPoints: 281.0 },
        { playerName: "rubito_xerezano", vpgPoints: 36.0 }
    ];
    
    console.log("=== INICIANDO AJUSTE MASIVO DE ANOMALÍAS DE BASEPOINTS ===");
    
    const playerColl = db.collection('player_profiles');
    const teamColl = db.collection('fantasy_teams');
    const leagueColl = db.collection('fantasy_leagues');
    
    let leaguesUpdatedCount = 0;
    let teamsCorrectedCount = 0;
    
    for (const entry of anomaliesToProcess) {
        const playerNameLower = entry.playerName.toLowerCase();
        
        // Find player in database to get the exact case name
        const player = await playerColl.findOne({
            eaPlayerName: { $regex: new RegExp('^' + entry.playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
        });
        
        if (!player) {
            console.log(`[WARN] Jugador no encontrado en DB: ${entry.playerName}`);
            continue;
        }
        
        const eaPlayerNameExact = player.eaPlayerName;
        const vpgPoints = entry.vpgPoints;
        const errorCashAmount = vpgPoints * 80000;
        
        // Find all zero leagues
        const zeroLeagues = await leagueColl.find({ pointsMode: 'zero', status: { $ne: 'closed' } }).toArray();
        
        for (const league of zeroLeagues) {
            const basePointsMap = league.basePoints || {};
            const foundKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === playerNameLower);
            const baseVal = foundKey ? basePointsMap[foundKey] : undefined;
            
            // Si el base es 0 o undefined, corregir en la liga
            if (baseVal === 0 || baseVal === undefined) {
                const keyToSet = foundKey || eaPlayerNameExact;
                await leagueColl.updateOne(
                    { _id: league._id },
                    { $set: { [`basePoints.${keyToSet}`]: vpgPoints } }
                );
                console.log(`- Liga "${league.name}": basePoints de ${keyToSet} establecido de ${baseVal} a ${vpgPoints}`);
                leaguesUpdatedCount++;
                
                // Buscar si hay un equipo en esta liga que tenga a este jugador y le haya puntuado
                const team = await teamColl.findOne({
                    leagueId: league._id.toString(),
                    players: eaPlayerNameExact
                });
                
                if (team) {
                    const isStarter = (team.lineup?.POR === eaPlayerNameExact) ||
                        (team.lineup?.DFC || []).includes(eaPlayerNameExact) ||
                        (team.lineup?.MC || []).includes(eaPlayerNameExact) ||
                        (team.lineup?.DC || []).includes(eaPlayerNameExact);
                        
                    // Si es titular y el equipo tiene suficientes puntos para haber cobrado este error
                    if (isStarter && team.points >= vpgPoints) {
                        const oldPoints = team.points;
                        const oldBalance = team.balance;
                        const newPoints = Math.max(0, Math.round((oldPoints - vpgPoints) * 10) / 10);
                        const newBalance = oldBalance - errorCashAmount;
                        
                        await teamColl.updateOne(
                            { _id: team._id },
                            { 
                                $set: { 
                                    points: newPoints,
                                    balance: newBalance
                                } 
                            }
                        );
                        console.log(`  * [CORRECCIÓN] Equipo "${team.teamName}": Puntos ${oldPoints} -> ${newPoints} (-${vpgPoints}) | Saldo ${oldBalance.toLocaleString('es-ES')} € -> ${newBalance.toLocaleString('es-ES')} € (-${errorCashAmount.toLocaleString('es-ES')} €)`);
                        teamsCorrectedCount++;
                    }
                }
            }
        }
    }
    
    console.log(`\n=== MIGRACIÓN MASIVA COMPLETADA ===`);
    console.log(`Ligas actualizadas (campos de basePoints establecidos): ${leaguesUpdatedCount}`);
    console.log(`Equipos corregidos (puntos/saldos descontados): ${teamsCorrectedCount}`);
    process.exit(0);
}

run();
