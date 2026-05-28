import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString(),
        message: { $regex: /elbrokoo30/i }
    }).toArray();
    
    console.log(`Found ${news.length} news items for elbrokoo30:`);
    for (const n of news) {
        console.log(`- [${n.type}] ${n.message} (Date: ${n.createdAt.toISOString()})`);
    }
    
    // Check if CHAGO TEAM has a bid or buyout or when they got him
    const chago = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /chago/i
    });
    console.log(`\nCHAGO TEAM Roster:`, chago ? chago.players : 'Not found');
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
