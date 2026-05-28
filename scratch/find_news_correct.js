// scratch/find_news_correct.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Buscar noticias con Nestor recibe
    const news = await db.collection('fantasy_news').find({
        message: { $regex: /Nestor recibe/i }
    }).toArray();

    console.log(`Encontradas ${news.length} noticias que coinciden con "Nestor recibe":`);
    news.forEach(n => {
        console.log(`  - LeagueId: ${n.leagueId} | Message: ${n.message} | CreatedAt: ${n.createdAt ? n.createdAt.toISOString() : 'N/A'}`);
    });

    // 2. Buscar todas las noticias de hoy de la liga STAFF BLITZ (ID: 6a11059081beb9b56df55c1b)
    const today = new Date('2026-05-28T00:00:00.000Z');
    const staffNews = await db.collection('fantasy_news').find({
        leagueId: "6a11059081beb9b56df55c1b",
        createdAt: { $gte: today }
    }).toArray();
    console.log(`\nEncontradas ${staffNews.length} noticias hoy en la liga STAFF BLITZ:`);
    staffNews.forEach(n => {
        console.log(`  - [${n.type}] ${n.message}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
