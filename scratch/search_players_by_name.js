// scratch/search_players_by_name.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Buscando coincidencias para "Clim" o "Clem" en player_profiles ---');
    const profiles = await db.collection('player_profiles').find({
        eaPlayerName: { $regex: /(clim|clem)/i }
    }).toArray();
    
    console.log(`Encontrados ${profiles.length} perfiles:`);
    for (const p of profiles) {
        console.log(`- eaPlayerName: "${p.eaPlayerName}"`);
    }
    
    console.log('\n--- Buscando coincidencias para "Nestor" en player_profiles ---');
    const nestors = await db.collection('player_profiles').find({
        eaPlayerName: { $regex: /nestor/i }
    }).toArray();
    
    console.log(`Encontrados ${nestors.length} perfiles:`);
    for (const p of nestors) {
        console.log(`- eaPlayerName: "${p.eaPlayerName}"`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
