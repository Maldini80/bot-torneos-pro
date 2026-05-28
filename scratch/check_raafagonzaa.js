import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    
    const profile = await db.collection('player_profiles').findOne({ eaPlayerName: /raafagonzaa98/i });
    console.log("=== raafagonzaa98 Profile ===");
    console.log(JSON.stringify(profile, null, 2));
    
    // Check their basePoints in jam esports league (6a10abe66bb40cd90498cca8)
    const league = await db.collection('fantasy_leagues').findOne({ _id: new (getDb().ObjectId || String)("6a10abe66bb40cd90498cca8") });
    if (league && league.basePoints) {
        console.log("\nbasePoints for raafagonzaa98 in Jam Esports league:", league.basePoints["raafagonzaa98"]);
    }

    process.exit(0);
}

run().catch(console.error);
