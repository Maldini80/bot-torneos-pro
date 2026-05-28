// scratch/check_all_news.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Checking fantasy_news collection ---');
    const totalNews = await db.collection('fantasy_news').countDocuments();
    console.log(`Total news documents in database: ${totalNews}`);
    
    // Group by leagueId to see counts
    const aggregation = await db.collection('fantasy_news').aggregate([
        { $group: { _id: "$leagueId", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    
    console.log(`\nNews count by league:`);
    for (const item of aggregation) {
        const league = await db.collection('fantasy_leagues').findOne({ _id: item._id });
        const leagueName = league ? league.name : `Unknown League (ID: ${item._id})`;
        console.log(`- League "${leagueName}": ${item.count} news items`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
