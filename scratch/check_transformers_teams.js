import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const teams = await db.collection('fantasy_teams').find({
        leagueId: league._id.toString()
    }).toArray();
    
    console.log(`Teams in ${league.name} (Initial Budget: ${league.initialBudget}):`);
    for (const t of teams) {
        console.log(`- ${t.teamName.padEnd(25)} | Balance: ${t.balance.toLocaleString().padStart(15)} € | Players: ${t.players.length} | Points: ${t.points}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
