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
        
        console.log('=== ÚLTIMAS 15 NOTICIAS EN FANTASY_NEWS ===\n');
        const news = await db.collection('fantasy_news').find({}).sort({ timestamp: -1 }).limit(15).toArray();
        news.forEach(n => {
            console.log(JSON.stringify({
                _id: n._id,
                leagueId: n.leagueId,
                type: n.type,
                message: n.message,
                timestamp: n.timestamp ? (n.timestamp.toISOString ? n.timestamp.toISOString() : n.timestamp) : 'N/A'
            }, null, 2));
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
