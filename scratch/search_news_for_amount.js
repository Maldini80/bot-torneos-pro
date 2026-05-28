import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString()
    }).toArray();
    
    console.log("Searching for values around 17M or 17.163.000 in news:");
    for (const n of news) {
        if (n.message.includes('17.') || n.message.includes('17163')) {
            console.log(`- ${n.message} (${n.createdAt.toISOString()})`);
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
