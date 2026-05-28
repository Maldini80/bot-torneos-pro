import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- BUSCANDO PERFILES DESPUÉS DE LA SINCRONIZACIÓN ---');
        const uriii = await db.collection('player_profiles').findOne({ eaPlayerName: 'Uriii-07-' });
        console.log('Uriii-07-:', JSON.stringify(uriii, null, 2));
        
        const ublaya = await db.collection('player_profiles').findOne({ eaPlayerName: 'ublaya777' });
        console.log('ublaya777:', JSON.stringify(ublaya, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
