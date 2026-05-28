import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== LOGS DE RECOMPENSAS EN LIGA JAM ===\n');
        
        const jamLeagueId = '6a10abe66bb40cd90498cca8';
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        
        const news = await db.collection('fantasy_news').find({
            leagueId: jamLeagueId,
            type: 'reward',
            createdAt: { $gte: startOfToday }
        }).toArray();
        
        console.log(`Encontradas ${news.length} recompensas repartidas hoy en la liga JAM:`);
        news.forEach(n => {
            console.log(`- [${new Date(n.createdAt).toLocaleTimeString('es-ES')}] ${n.message}`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
