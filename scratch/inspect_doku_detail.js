import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== DETALLE DE STATS DE xDoku_11 ===\n');
        
        const player = await db.collection('player_profiles').findOne({ eaPlayerName: 'xDoku_11' });
        if (!player) {
            console.log('No se encontró al jugador xDoku_11.');
            return;
        }
        
        console.log('Documento del jugador:');
        console.log(JSON.stringify(player, null, 2));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
