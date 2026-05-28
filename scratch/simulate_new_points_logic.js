// scratch/simulate_new_points_logic.js
import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

// Función para verificar si un jugador está alineado en el Once Titular
function isPlayerInLineup(lineup, playerName) {
    if (!lineup) return false;
    const nameLower = playerName.toLowerCase();
    
    if (lineup.POR && lineup.POR.toLowerCase() === nameLower) return true;
    
    if (Array.isArray(lineup.DFC) && lineup.DFC.some(p => p && p.toLowerCase() === nameLower)) return true;
    if (Array.isArray(lineup.MC) && lineup.MC.some(p => p && p.toLowerCase() === nameLower)) return true;
    if (Array.isArray(lineup.DC) && lineup.DC.some(p => p && p.toLowerCase() === nameLower)) return true;
    
    return false;
}

async function main() {
    await connectDb();
    const db = getDb();
    
    // Ligas objetivo que están en modo ZERO y tienen equipos
    const targetLigas = [
        { name: "IMPERIO GITANO", id: "6a1104f781beb9b56df55c19" },
        { name: "Oxygen Levante", id: "6a1366e695bac5e6a15a782a" }
    ];
    
    for (const ligaInfo of targetLigas) {
        console.log(`\n======================================================================`);
        console.log(` SIMULACIÓN DE JORNADA FANTASY: LIGA "${ligaInfo.name.toUpperCase()}"`);
        console.log(`======================================================================`);
        
        // Obtener la liga
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(ligaInfo.id) });
        if (!league) {
            console.log(`❌ No se encontró la liga ${ligaInfo.name}`);
            continue;
        }
        
        const basePoints = league.basePoints || {};
        
        // Obtener todos los equipos de la liga
        const teams = await db.collection('fantasy_teams').find({ leagueId: ligaInfo.id }).toArray();
        console.log(`Total equipos a simular: ${teams.length}`);
        
        for (const team of teams) {
            console.log(`\n----------------------------------------------------------------------`);
            console.log(`🛡️ EQUIPO: "${team.teamName.toUpperCase()}" (Mánager: ${team.captainName || team.discordId})`);
            console.log(`----------------------------------------------------------------------`);
            
            const players = team.players || [];
            const lineup = team.lineup || {};
            
            let totalOncePoints = 0;
            let totalBanquilloPoints = 0;
            
            const onceDetalle = [];
            const banquilloDetalle = [];
            
            for (const playerName of players) {
                // Obtener perfil del jugador para ver sus puntos VPG reales
                const playerProfile = await db.collection('player_profiles').findOne({ 
                    eaPlayerName: { $regex: new RegExp(`^${playerName}$`, 'i') } 
                });
                
                const currentVpgPoints = playerProfile?.stats?.vpgPoints || 0;
                
                // Obtener su base en la liga
                let base = undefined;
                const playerNameLower = playerName.toLowerCase();
                if (basePoints[playerName] !== undefined) {
                    base = basePoints[playerName];
                } else {
                    const foundKey = Object.keys(basePoints).find(k => k.toLowerCase() === playerNameLower);
                    if (foundKey !== undefined) {
                        base = basePoints[foundKey];
                    }
                }
                
                // Si no tiene base inicial, asumimos que su base inicial son sus puntos VPG actuales (delta = 0)
                const baseUsada = base !== undefined ? base : currentVpgPoints;
                
                // Calcular delta
                const delta = Math.max(0, Math.round((currentVpgPoints - baseUsada) * 10) / 10);
                
                const isStarter = isPlayerInLineup(lineup, playerName);
                
                const playerInfo = {
                    name: playerName,
                    vpgPoints: currentVpgPoints,
                    base: baseUsada,
                    delta: delta,
                    isStarter: isStarter
                };
                
                if (isStarter) {
                    onceDetalle.push(playerInfo);
                    totalOncePoints += delta;
                } else {
                    banquilloDetalle.push(playerInfo);
                    totalBanquilloPoints += delta;
                }
            }
            
            // Mostrar titulares alineados
            console.log(`  🟢 TITULARES (ONCE TITULAR):`);
            if (onceDetalle.length === 0) {
                console.log(`     ⚠️ No hay jugadores alineados en el once titular.`);
            } else {
                onceDetalle.forEach(p => {
                    console.log(`     - [TITULAR] ${p.name.padEnd(20)} | VPG: ${p.vpgPoints.toFixed(1).padStart(5)} | Base: ${p.base.toFixed(1).padStart(5)} | Delta: +${p.delta.toFixed(1)} pts`);
                });
            }
            
            // Mostrar suplentes en banquillo
            console.log(`\n  🪑 SUPLENTES (BANQUILLO):`);
            if (banquilloDetalle.length === 0) {
                console.log(`     No hay suplentes en la plantilla.`);
            } else {
                banquilloDetalle.forEach(p => {
                    console.log(`     - [SUPLENTE] ${p.name.padEnd(19)} | VPG: ${p.vpgPoints.toFixed(1).padStart(5)} | Base: ${p.base.toFixed(1).padStart(5)} | Delta: +${p.delta.toFixed(1)} pts (Teóricos, no suman)`);
                });
            }
            
            // Resultados globales del equipo
            totalOncePoints = Math.round(totalOncePoints * 10) / 10;
            totalBanquilloPoints = Math.round(totalBanquilloPoints * 10) / 10;
            const rewardMoney = totalOncePoints * 80000;
            
            console.log(`\n  📊 RESUMEN DEL EQUIPO:`);
            console.log(`     * Puntos sumados por el ONCE:    +${totalOncePoints.toFixed(1)} pts  <-- (Suman al equipo)`);
            console.log(`     * Recompensa económica teórica:  +${rewardMoney.toLocaleString('es-ES')} €  (80.000 €/punto)`);
            console.log(`     * Puntos perdidos en banquillo:  +${totalBanquilloPoints.toFixed(1)} pts  (No sumaron por suplencia)`);
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
