import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const mongoUri = process.env.DATABASE_URL;
    const client = new MongoClient(mongoUri);
    try {
        await client.connect();
        const db = client.db('test');
        const team = await db.collection('teams').findOne({ name: /Black Hawks/i });
        console.log('Black Hawks Team Document:');
        console.log(JSON.stringify(team, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
