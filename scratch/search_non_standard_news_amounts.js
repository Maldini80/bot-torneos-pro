import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString()
    }).toArray();
    
    console.log("News with non-standard amounts:");
    for (const n of news) {
        const msg = n.message || '';
        const matches = msg.match(/([0-9.]+)\s*€/g);
        if (matches) {
            for (const m of matches) {
                const cleaned = m.replace(/\./g, '').replace('€', '').trim();
                const num = parseInt(cleaned, 10);
                if (num % 500 !== 0) {
                    console.log(`- [${n.type}] ${m} | Msg: ${msg} (${n.createdAt.toISOString()})`);
                }
            }
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
