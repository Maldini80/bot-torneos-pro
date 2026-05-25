import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const col = db.collection('player_profiles');
        
        console.log('Searching for AharonGS6666c in player_profiles...');
        const p = await col.findOne({ eaPlayerName: { $regex: /^aharon/i } });
        console.log(p);
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
