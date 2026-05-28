import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString()
    }).toArray();
    
    news.sort((a, b) => a.createdAt - b.createdAt);
    
    console.log(`All news containing "HUMANES" (total: ${news.length} total news items in league):`);
    let count = 0;
    for (const n of news) {
        if (n.message.toLowerCase().includes('humanes')) {
            count++;
            console.log(`${count.toString().padStart(3)}: [${n.createdAt.toISOString()}] [${n.type}] ${n.message}`);
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
