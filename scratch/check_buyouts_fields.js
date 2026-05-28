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
        
        const b = await db.collection('fantasy_buyouts').findOne({});
        console.log('Sample Buyout Document:', JSON.stringify(b, null, 2));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
