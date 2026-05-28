// scratch/check_rubstore66.js
import { connectDb, getDb } from '../database.js';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Buscar jugador rubstore66
    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /^rubstore66$/i }
    });
    if (!player) {
        console.log('Jugador rubstore66 no encontrado.');
        process.exit(0);
    }
    const { points: rawPoints } = calculatePlayerPointsAndPrice(player);
    console.log('[RUBSTORE66] Perfil en DB:', {
        eaPlayerName: player.eaPlayerName,
        vpgPoints: player.stats?.vpgPoints,
        calculatedRawPoints: rawPoints
    });

    // 2. Buscar en qué ligas tiene basePoints
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    for (const league of leagues) {
        if (league.basePoints) {
            const foundKey = Object.keys(league.basePoints).find(k => k.toLowerCase() === 'rubstore66');
            if (foundKey) {
                console.log(`[RUBSTORE66] En liga "${league.name}" (ID: ${league._id}):`);
                console.log(`  - basePoints: ${league.basePoints[foundKey]}`);
                const netPoints = Math.max(0, Math.round((rawPoints - league.basePoints[foundKey]) * 10) / 10);
                console.log(`  - netPoints calculado: ${netPoints}`);
            }
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
