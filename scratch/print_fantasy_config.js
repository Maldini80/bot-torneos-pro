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
        
        console.log('=== DOCUMENTOS EN FANTASY_CONFIG ===\n');
        const docs = await db.collection('fantasy_config').find({}).toArray();
        docs.forEach(doc => {
            console.log(JSON.stringify(doc, null, 2));
        });
        
        console.log('\n=== DOCUMENTOS EN GLOBAL_CONFIGS ===\n');
        const gDocs = await db.collection('global_configs').find({}).toArray();
        gDocs.forEach(doc => {
            console.log(JSON.stringify(doc, null, 2));
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
