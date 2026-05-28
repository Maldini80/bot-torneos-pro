import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('test');
        
        // Find team Jam
        const jamTeam = await db.collection('teams').findOne({
            name: { $regex: /jam/i }
        });
        
        console.log('JAM Esports Team Document in test.teams:');
        console.log(JSON.stringify(jamTeam, null, 2));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
