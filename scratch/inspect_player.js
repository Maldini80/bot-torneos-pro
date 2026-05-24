import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    console.log('[DB INSPECT] Conectando a la base de datos...');
    await connectDb();
    const db = getDb();
    
    console.log('[DB INSPECT] Buscando al jugador xDoku_11...');
    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /^xDoku_11$/i }
    });
    
    if (player) {
        console.log('[DB INSPECT] Jugador encontrado:');
        console.log(JSON.stringify(player, null, 2));
    } else {
        console.log('[DB INSPECT] Jugador no encontrado en la base de datos.');
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error('[DB INSPECT] Error:', err);
    process.exit(1);
});
