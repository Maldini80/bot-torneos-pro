import { connectDb, getDb } from '../database.js';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    await connectDb();
    const db = getDb();
    
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: "xpetruu" });
    if (!player) {
        console.log('No xpetruu found');
        process.exit(0);
    }
    
    const vpgPoints = player.stats?.vpgPoints || 155.8;
    
    const leagues = await db.collection('fantasy_leagues').find({
        pointsMode: 'zero',
        status: { $ne: 'closed' }
    }).toArray();
    
    const leaguesMap = new Map(leagues.map(l => [l._id.toString(), l]));
    
    console.log("=== ANALIZANDO IMPACTO Y PLAN DE CORRECCIÓN PARA XPETRUU ===");
    
    const teams = await db.collection('fantasy_teams').find({
        players: player.eaPlayerName
    }).toArray();
    
    let corrections = [];
    
    for (const team of teams) {
        const league = leaguesMap.get(team.leagueId);
        if (!league) continue;
        
        const basePointsMap = league.basePoints || {};
        const baseVal = basePointsMap[player.eaPlayerName] ?? basePointsMap[player.eaPlayerName.toLowerCase()] ?? 0;
        
        if (baseVal === 0) {
            // El jugador tiene base 0 en esta liga.
            const isStarter = (team.lineup?.POR === player.eaPlayerName) ||
                (team.lineup?.DFC || []).includes(player.eaPlayerName) ||
                (team.lineup?.MC || []).includes(player.eaPlayerName) ||
                (team.lineup?.DC || []).includes(player.eaPlayerName);
                
            let alreadyReceived = false;
            let pointsToSubtract = 0;
            let balanceToSubtract = 0;
            
            // Si el equipo tiene bastantes puntos, y él es titular, es muy probable que ya haya recibido los puntos.
            // Si los puntos del equipo son menores que 155.8, no puede haberlos recibido todavía.
            if (isStarter && team.points >= 155.8) {
                alreadyReceived = true;
                pointsToSubtract = vpgPoints;
                balanceToSubtract = vpgPoints * 80000;
            }
            
            corrections.push({
                leagueId: league._id,
                leagueName: league.name,
                teamId: team._id,
                teamName: team.teamName,
                ownerName: team.ownerName || team.discordId,
                isStarter,
                currentPoints: team.points,
                currentBalance: team.balance,
                alreadyReceived,
                pointsToSubtract,
                balanceToSubtract
            });
        }
    }
    
    console.log(`\nEncontrados ${corrections.length} equipos en riesgo/afectados:`);
    for (const c of corrections) {
        console.log(`\n- Liga: "${c.leagueName}" | Equipo: "${c.teamName}" (${c.ownerName})`);
        console.log(`  * ¿Es titular?: ${c.isStarter ? 'SÍ' : 'NO'}`);
        console.log(`  * Puntos actuales del equipo: ${c.currentPoints}`);
        console.log(`  * Saldo actual del equipo: ${c.currentBalance.toLocaleString('es-ES')} €`);
        if (c.alreadyReceived) {
            console.log(`  * [AFECTADO] Ya recibió los puntos. Reducción propuesta: -${c.pointsToSubtract} pts y -${c.balanceToSubtract.toLocaleString('es-ES')} €`);
        } else {
            console.log(`  * [PREVENCIÓN] Aún no ha puntuado (o es suplente). Se corregirá la base a ${vpgPoints} para evitar que puntúe de golpe.`);
        }
    }
    
    process.exit(0);
}

run();
