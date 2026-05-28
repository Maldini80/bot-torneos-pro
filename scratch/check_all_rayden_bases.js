import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    console.log("=== Base Points for zzRaydenzz in all leagues ===");
    
    for (const l of leagues) {
        if (l.basePoints) {
            const keys = Object.keys(l.basePoints);
            const foundKey = keys.find(k => k.toLowerCase() === 'zzraydenzz');
            if (foundKey) {
                console.log(`- League "${l.name}" (ID: ${l._id}): ${foundKey} = ${l.basePoints[foundKey]}`);
            }
        }
    }
    
    process.exit(0);
}

run().catch(console.error);
