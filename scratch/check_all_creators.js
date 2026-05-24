import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const uri = process.env.DATABASE_URL;
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();
        
        const leagues = await db.collection('fantasy_leagues').find({}).toArray();
        console.log('--- TODAS LAS LIGAS REGISTRADAS ---');
        leagues.forEach(l => {
            console.log(`ID: ${l._id} | Nombre: ${l.name} | Creado por: ${l.createdByUsername} (ID Discord: ${l.createdBy})`);
        });
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}
run();
