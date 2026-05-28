// scratch/find_news.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    const today = new Date('2026-05-28T00:00:00.000Z');
    const news = await db.collection('fantasy_news').find({
        message: { $regex: /Nestor recibe/i },
        timestamp: { $gte: today }
    }).toArray();

    console.log(`Encontradas ${news.length} noticias que coinciden con "Nestor recibe":`);
    news.forEach(n => {
        console.log(`  - LeagueId: ${n.leagueId} | Message: ${n.message} | Timestamp: ${n.timestamp.toISOString()}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
