import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString(),
        type: 'admin_action'
    }).toArray();
    
    console.log('--- Market Size Adjustments in News ---');
    for (const n of news) {
        console.log(`- Date: ${n.createdAt.toISOString()} | Msg: ${n.message}`);
    }
    
    // Also check the budget field in the team record for HUMANES FC
    const team = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /humanes/i
    });
    console.log('\n--- HUMANES FC Fields ---');
    console.log('balance:', team.balance);
    console.log('budget:', team.budget); // Check if budget field was created due to the bug
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
