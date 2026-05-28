// scratch/get_earliest_news_date.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Finding earliest news document ---');
    const earliestNews = await db.collection('fantasy_news').find({})
        .sort({ createdAt: 1 })
        .limit(1)
        .toArray();
        
    if (earliestNews.length > 0) {
        const doc = earliestNews[0];
        console.log(`Earliest news item found:`);
        console.log(`- Created At (createdAt field): ${doc.createdAt}`);
        console.log(`- Metadata timestamp: ${doc.metadata?.timestamp || 'None'}`);
        console.log(`- Message: "${doc.message || doc.content}"`);
    } else {
        console.log('No news documents found in the database!');
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
