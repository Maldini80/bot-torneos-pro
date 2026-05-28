import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    console.log('[ANALYZE XPETRU ZERO] Conectando a la base de datos...');
    await connectDb();
    const db = getDb();
    
    // Find player VPG points
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: "xpetruu" });
    if (!player) {
        console.log('[ANALYZE XPETRU ZERO] No se encontró a xpetruu.');
        process.exit(0);
    }
    
    const vpgPoints = player.stats?.vpgPoints || 0;
    console.log(`Puntos oficiales de VPG para xpetruu: ${vpgPoints}\n`);
    
    // Find active zero leagues
    const leagues = await db.collection('fantasy_leagues').find({
        pointsMode: 'zero',
        status: { $ne: 'closed' }
    }).toArray();
    
    console.log(`Encontradas ${leagues.length} ligas activas con modo "zero":`);
    
    for (const league of leagues) {
        let base = undefined;
        const basePointsMap = league.basePoints || {};
        
        // Find base points case insensitively
        const eaName = player.eaPlayerName;
        if (basePointsMap[eaName] !== undefined) {
            base = basePointsMap[eaName];
        } else {
            const keyLower = eaName.toLowerCase();
            const foundKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === keyLower);
            if (foundKey !== undefined) {
                base = basePointsMap[foundKey];
            }
        }
        
        if (base !== undefined) {
            const leaguePoints = Math.max(0, Math.round((vpgPoints - base) * 10) / 10);
            console.log(`- Liga: "${league.name}" (ID: ${league._id})`);
            console.log(`  * Base de puntos (basePoints): ${base}`);
            console.log(`  * Puntuación neta en la liga: ${leaguePoints} puntos`);
        } else {
            console.log(`- Liga: "${league.name}" (ID: ${league._id})`);
            console.log(`  * xpetruu NO tiene basePoints definida en esta liga.`);
        }
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error('[ANALYZE XPETRU ZERO] Error:', err);
    process.exit(1);
});
