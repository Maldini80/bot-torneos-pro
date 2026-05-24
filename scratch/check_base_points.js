import { getDb, connectDb } from '../database.js';

async function investigate() {
    await connectDb();
    const db = getDb();
    
    const leagueColl = db.collection('fantasy_leagues');
    const leagues = await leagueColl.find().toArray();
    for (const league of leagues) {
        console.log(`Liga: ${league.name} (${league._id})`);
        console.log(`  pointsMode: ${league.pointsMode}`);
        if (league.basePoints) {
            const keys = Object.keys(league.basePoints);
            console.log(`  basePoints count: ${keys.length}`);
            console.log(`  Sample basePoints:`, JSON.stringify(keys.slice(0, 5).reduce((acc, k) => {
                acc[k] = league.basePoints[k];
                return acc;
            }, {}), null, 2));
        } else {
            console.log(`  No basePoints defined.`);
        }
    }

    process.exit(0);
}

investigate().catch(console.error);
