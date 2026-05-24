// scratch/check_players.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Sample player_profiles Documents ---');
    const players = await db.collection('player_profiles').find({}).limit(5).toArray();
    console.log(JSON.stringify(players, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
