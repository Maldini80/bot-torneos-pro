import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    
    const playerName = "Daniveera";
    const teams = await db.collection('fantasy_teams').find({
        players: { $regex: new RegExp('^' + playerName + '$', 'i') }
    }).toArray();
    
    console.log(`Found ${teams.length} teams owning Daniveera:`);
    for (const t of teams) {
        console.log(`- Team: ${t.teamName} | League ID: ${t.leagueId} | Points: ${t.points}`);
    }
    
    process.exit(0);
}

run().catch(console.error);
