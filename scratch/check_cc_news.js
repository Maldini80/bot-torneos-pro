// scratch/check_cc_news.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // Buscar noticias en fantasy_news de hoy de la liga STAFF BLITZ
    const today = new Date('2026-05-28T00:00:00.000Z');
    const news = await db.collection('fantasy_news').find({
        leagueId: "6a11059081beb9b56df55c1b",
        timestamp: { $gte: today }
    }).toArray();

    console.log(`[NEWS] Encontradas ${news.length} noticias hoy en la liga STAFF BLITZ:`);
    news.forEach(n => {
        console.log(`  - [${n.type}] ${n.message} (Timestamp: ${n.timestamp.toISOString()})`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
