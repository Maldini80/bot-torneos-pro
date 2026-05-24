// scratch/check_db_fields.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const testDb = client.db('test');
        const teamsColl = testDb.collection('teams');
        const team = await teamsColl.findOne({ name: 'Ceuta Guardians' });
        console.log('Ceuta Guardians team document:', JSON.stringify(team, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
