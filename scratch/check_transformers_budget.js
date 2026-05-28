import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    console.log('TRANSFORMERS CF Doc:', JSON.stringify(league, null, 2));
    
    // Also let's check other teams in the same league to see their starting balance or current balance
    const teams = await db.collection('fantasy_teams').find({ leagueId: league._id.toString() }).toArray();
    console.log('\n--- All Teams in TRANSFORMERS CF ---');
    for (const t of teams) {
        console.log(`- Team: ${t.teamName} | Balance: ${t.balance.toLocaleString()} € | Players Count: ${t.players.length}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
