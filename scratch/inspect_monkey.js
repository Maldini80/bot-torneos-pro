import { getDb, connectDb } from '../database.js';

async function main() {
    await connectDb();
    const db = getDb();
    
    const names = ['MonKeyDFFYLU', 'ruben10_03', 'Aaron14'];
    for (const name of names) {
        console.log(`\n--- Búsqueda de ${name} ---`);
        const player = await db.collection('player_profiles').findOne({ eaPlayerName: new RegExp('^' + name + '$', 'i') });
        if (player) {
            console.log(JSON.stringify(player, null, 2));
        } else {
            console.log(`Player ${name} not found!`);
        }
    }
    process.exit(0);
}

main().catch(console.error);
