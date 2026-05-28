import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    await connectDb();
    const db = getDb();
    
    // Let's find teams with large balances or points
    const teams = await db.collection('fantasy_teams').find({}).toArray();
    console.log(`Found ${teams.length} total fantasy teams.`);
    
    // Log the top teams by points and balance
    const activeTeams = teams.filter(t => t.points > 0 || t.balance > 0);
    console.log(`Teams with stats: ${activeTeams.length}`);
    
    activeTeams.sort((a, b) => b.points - a.points);
    activeTeams.slice(0, 15).forEach(t => {
        console.log(`Team: ${t.teamName} | LeagueId: ${t.leagueId} | Points: ${t.points} | Balance: ${t.balance} | Players: ${t.players?.length || 0}`);
    });
    
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
