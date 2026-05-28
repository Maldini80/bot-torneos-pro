import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const todayMarketNews = await db.collection('fantasy_news').find({
        leagueId: league._id.toString(),
        createdAt: { $gte: new Date('2026-05-28T17:00:00.000Z') }
    }).toArray();
    
    todayMarketNews.sort((a, b) => a.createdAt - b.createdAt);
    console.log(`Found ${todayMarketNews.length} news items since 17:00 UTC today:`);
    for (const n of todayMarketNews) {
        console.log(`- [${n.type}] ${n.message} (Date: ${n.createdAt.toISOString()})`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
