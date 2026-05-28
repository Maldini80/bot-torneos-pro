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
        
        console.log('=== RAW DOC FROM FANTASY_NEWS ===\n');
        const doc = await db.collection('fantasy_news').findOne({});
        console.log(JSON.stringify(doc, null, 2));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
