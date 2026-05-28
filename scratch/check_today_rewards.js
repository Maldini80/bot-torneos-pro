import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const today = new Date('2026-05-28T00:00:00.000Z');
    
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString(),
        type: 'reward',
        createdAt: { $gte: today }
    }).toArray();
    
    console.log(`Rewards news items today (total: ${news.length}):`);
    for (const n of news) {
        console.log(`- Message: ${n.message} | Date: ${n.createdAt.toISOString()}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
