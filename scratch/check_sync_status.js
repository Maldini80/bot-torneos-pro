// scratch/check_sync_status.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Checking rebuild status/history ---');
    const logs = await db.collection('fantasy_config').findOne({ key: 'active_leagues' });
    console.log(`Active Leagues:`, logs ? logs.slugs : 'None');

    const schedules = await db.collection('fantasy_config').findOne({ key: 'schedules' });
    console.log(`Schedules:`, JSON.stringify(schedules, null, 2));

    // Check if there are any sync log entries or news feed logs of type 'reward' for xDoku_11
    const news = await db.collection('fantasy_news').find({ 
        content: { $regex: /xDoku_11/i } 
    }).toArray();
    console.log(`Found ${news.length} news entries containing 'xDoku_11'.`);
    news.slice(0, 10).forEach(n => {
        console.log(`- [${n.timestamp}] ${n.content}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
