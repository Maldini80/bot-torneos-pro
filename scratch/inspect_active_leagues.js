import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    
    const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
    console.log("=== Active Leagues Configuration ===");
    console.log(JSON.stringify(config, null, 2));
    
    process.exit(0);
}

run().catch(console.error);
