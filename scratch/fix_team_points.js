import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

// Puntos VPG CORRECTOS (ya corregidos en la DB)
const AFFECTED = [
    { name: 'Retromoneybeatz', realPts: 233.5, inflatedPts: 467 },
    { name: 'nestor007', realPts: 104.7, inflatedPts: 209.4 },
    { name: 'xDiiego10#6089', realPts: 268.1, inflatedPts: 514.9 },
    { name: '13alvaro12', realPts: 145.9, inflatedPts: 291.8 },
    { name: 'FrancM2P8', realPts: 120.5, inflatedPts: 225 },
    { name: 'zzRaydenzz', realPts: 92.2, inflatedPts: 127.5 },
    { name: 'not_ven00m', realPts: 97.1, inflatedPts: 194.2 },
];

function isPlayerInLineup(lineup, playerName) {
    if (!lineup || !playerName) return false;
    const nameLower = playerName.toLowerCase();
    if (lineup.POR && lineup.POR.toLowerCase() === nameLower) return true;
    for (const pos of ['DFC', 'MC', 'DC', 'CARR']) {
        if (Array.isArray(lineup[pos]) && lineup[pos].some(p => p && p.toLowerCase() === nameLower)) return true;
    }
    return false;
}

async function main() {
    const DRY_RUN = process.argv.includes('--execute') ? false : true;
    
    if (DRY_RUN) {
        console.log('=== MODO DRY RUN (añade --execute para aplicar) ===\n');
    } else {
        console.log('=== MODO EJECUCIÓN ===\n');
    }
    
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    // Cargar el historial del sync de puntos para saber cuántos puntos se le dieron a cada equipo
    // La clave: los puntos del equipo (team.points) son la SUMA de todos los puntos fantasy de sus titulares
    // En modo zero: puntos fantasy del jugador = vpgPoints_actual - basePoints
    // Los puntos del equipo se acumulan como SUM de (delta vpgPoints de titulares) en cada sync
    
    // Enfoque: Para cada liga con modo zero, calcular:
    // - Puntos que el jugador MOSTRABA antes del fix = inflatedPts - basePoints
    // - Puntos que el jugador DEBERÍA mostrar = realPts - basePoints  
    // - Diferencia = inflatedPts - realPts (el basePoints se cancela)
    // PERO: esto es lo que se MUESTRA en la tarjeta. Los puntos del EQUIPO vienen del sync.
    
    // El sync calcula: para cada titular, delta = vpgPoints_new - vpgPoints_old
    // Los puntos fantasma se distribuyeron como deltas extra durante los syncs
    // Total fantasma = inflatedPts - realPts = extraPts
    
    // PERO un manager podría haber puesto al jugador en el once DESPUÉS de algunos syncs
    // En ese caso, solo recibió los puntos de los syncs posteriores, no todos
    
    // Sin embargo: como las ligas se crearon hace 2-5 días y el bug afecta desde el primer sync,
    // y los jugadores fueron asignados al unirse, es PROBABLE que los puntos fantasma
    // se acumularan desde el primer sync del equipo
    
    // Mejor enfoque: Los puntos del equipo = SUM de puntos de todos los titulares
    // Si recalculamos los puntos del equipo usando los vpgPoints CORREGIDOS, 
    // la diferencia es exactamente lo que hay que restar
    
    // RECALCULAR puntos del equipo:
    // team.points = SUM de (vpgPoints_actual - basePoints) de todos los titulares
    
    const corrections = [];
    
    // Para cada liga de modo zero
    const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
    
    for (const league of leagues) {
        const leagueId = league._id.toString();
        const basePoints = league.basePoints || {};
        
        // Obtener todos los equipos de esta liga
        const teams = await db.collection('fantasy_teams').find({ leagueId, approved: true }).toArray();
        
        for (const team of teams) {
            // Verificar si este equipo tiene algún jugador afectado en su once
            let hasAffected = false;
            let totalExtraPts = 0;
            const affectedDetails = [];
            
            for (const player of AFFECTED) {
                if (!team.players || !team.players.some(p => p.toLowerCase() === player.name.toLowerCase())) continue;
                
                const inLineup = isPlayerInLineup(team.lineup, player.name);
                if (!inLineup) continue;
                
                hasAffected = true;
                
                // Los puntos extra que este jugador contribuyó = inflatedPts - realPts
                // (el basePoints no importa porque se cancela en la resta)
                const extraPts = Math.round((player.inflatedPts - player.realPts) * 10) / 10;
                totalExtraPts += extraPts;
                
                affectedDetails.push({
                    playerName: player.name,
                    extraPts,
                    base: basePoints[player.name] || 'N/A'
                });
            }
            
            if (hasAffected && totalExtraPts > 0) {
                totalExtraPts = Math.round(totalExtraPts * 10) / 10;
                const currentPts = team.points || 0;
                const correctedPts = Math.round(Math.max(0, currentPts - totalExtraPts) * 10) / 10;
                
                corrections.push({
                    leagueName: league.name,
                    leagueId,
                    teamId: team._id,
                    teamName: team.teamName,
                    discordId: team.discordId,
                    currentPts,
                    totalExtraPts,
                    correctedPts,
                    affectedDetails
                });
                
                console.log(`📋 ${league.name} | 👤 ${team.teamName}`);
                console.log(`   Puntos actuales: ${currentPts}`);
                for (const d of affectedDetails) {
                    console.log(`   ⚽ ${d.playerName}: -${d.extraPts} pts fantasma (base: ${d.base})`);
                }
                console.log(`   ✏️  Puntos corregidos: ${currentPts} - ${totalExtraPts} = ${correctedPts}`);
                console.log('');
            }
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TOTAL: ${corrections.length} equipos a corregir`);
    console.log('='.repeat(60));
    
    if (!DRY_RUN && corrections.length > 0) {
        console.log('\nAplicando correcciones...\n');
        for (const c of corrections) {
            await db.collection('fantasy_teams').updateOne(
                { _id: c.teamId },
                { $set: { points: c.correctedPts } }
            );
            console.log(`✅ ${c.teamName} (${c.leagueName}): ${c.currentPts} → ${c.correctedPts}`);
        }
        console.log('\n=== TODAS LAS CORRECCIONES APLICADAS ===');
    }
    
    await client.close();
}

main().catch(console.error);
