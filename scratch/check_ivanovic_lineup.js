import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    
    const team = await db.collection('fantasy_teams').findOne({ _id: new (getDb().ObjectId || String)("6a10b2d9f7eee658f4490893") });
    console.log("=== Ivanovic Team Lineup ===");
    console.log(JSON.stringify(team?.lineup, null, 2));
    
    process.exit(0);
}

run().catch(console.error);
