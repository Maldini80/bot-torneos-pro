import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const col = db.collection('player_profiles');
        
        console.log('Querying player profile for MonKeyDFFYLU...');
        const p = await col.findOne({ eaPlayerName: 'MonKeyDFFYLU' });
        console.log(JSON.stringify(p, null, 2));
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
