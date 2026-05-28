import { getDb, connectDb } from '../database.js';
import { ObjectId } from 'mongodb';

async function run() {
    await connectDb();
    const db = getDb();
    
    const playerName = "Daniveera";
    const playerLower = playerName.toLowerCase();
    
    // Get player profile
    const profile = await db.collection('player_profiles').findOne({ eaPlayerName: { $regex: new RegExp('^' + playerName + '$', 'i') } });
    console.log("=== Daniveera Profile ===");
    console.log(JSON.stringify(profile, null, 2));
    
    // Get team Tonitollora
    const team = await db.collection('fantasy_teams').findOne({ teamName: /Tonitollora/i });
    if (team) {
        console.log("\n=== Team Tonitollora ===");
        console.log(`League ID: ${team.leagueId}`);
        console.log(`Lineup:`, JSON.stringify(team.lineup, null, 2));
        
        // Get league
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
        if (league) {
            console.log("\n=== League Settings ===");
            console.log(`Name: ${league.name}`);
            console.log(`Points Mode: ${league.pointsMode}`);
            console.log(`Base Points value for Daniveera:`, league.basePoints?.[playerName] ?? league.basePoints?.[playerLower] ?? "NOT FOUND");
        }
    }
    
    process.exit(0);
}

run().catch(console.error);
