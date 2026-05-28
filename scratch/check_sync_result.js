import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== VERIFICANDO RESULTADO DE LA SINCRONIZACIÓN DE HOY ===\n');
        
        // 1. Check last sync date in config
        const config = await db.collection('fantasy_config').findOne({ key: "schedules" });
        console.log(`Fecha del último sync de puntos en DB:`, config?.points?.lastRun || "Ninguno");
        
        // 2. Check if any news about rewards were published today (May 27, 2026)
        const todayStart = new Date("2026-05-27T00:00:00.000Z");
        const todayEnd = new Date("2026-05-27T23:59:59.999Z");
        
        const rewardsNews = await db.collection('fantasy_news').find({
            type: 'reward',
            createdAt: { $gte: todayStart, $lte: todayEnd }
        }).sort({ createdAt: -1 }).toArray();
        
        console.log(`Noticias de recompensas de puntos publicadas hoy: ${rewardsNews.length}`);
        if (rewardsNews.length > 0) {
            console.log('Muestra de recompensas repartidas hoy:');
            rewardsNews.slice(0, 10).forEach(n => {
                console.log(`  - [${new Date(n.createdAt).toLocaleString('es-ES')}] Liga: ${n.leagueId} | Mensaje: ${n.message}`);
            });
        }
        
        // 3. Find the latest 10 news items today
        const otherNews = await db.collection('fantasy_news').find({
            createdAt: { $gte: todayStart, $lte: todayEnd }
        }).sort({ createdAt: -1 }).limit(10).toArray();
        
        console.log(`\nÚltimas 10 noticias del feed registradas hoy:`);
        otherNews.forEach(n => {
            console.log(`  - [${new Date(n.createdAt).toLocaleString('es-ES')}] Tipo: ${n.type} | Mensaje: ${n.message}`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
