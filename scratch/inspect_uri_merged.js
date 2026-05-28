import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- BUSCANDO PERFIL DE Uriii-07- DESPUÉS DE LA FUSIÓN ---');
        const player = await db.collection('player_profiles').findOne({ eaPlayerName: 'Uriii-07-' });
        console.log(JSON.stringify(player, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
