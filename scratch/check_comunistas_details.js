import { getDb, connectDb } from '../database.js';
import { ObjectId } from 'mongodb';

async function run() {
    await connectDb();
    const db = getDb();
    
    const team = await db.collection('fantasy_teams').findOne({ teamName: /Comunistas FC/i });
    if (team) {
        console.log("=== Team Comunistas FC ===");
        console.log(`Points: ${team.points}`);
        console.log(`League ID: ${team.leagueId}`);
        console.log(`Lineup:`, JSON.stringify(team.lineup, null, 2));
        
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
        if (league) {
            console.log("\n=== League Settings ===");
            console.log(`Name: ${league.name}`);
            console.log(`Points Mode: ${league.pointsMode}`);
            console.log(`Daniveera basePoints:`, league.basePoints?.Daniveera ?? league.basePoints?.daniveera ?? "NOT FOUND");
        }
    }
    
    process.exit(0);
}

run().catch(console.error);
