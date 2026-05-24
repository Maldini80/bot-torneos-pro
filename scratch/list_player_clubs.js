// scratch/list_player_clubs.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Distinct lastClub in player_profiles ---');
    const clubs = await db.collection('player_profiles').distinct('lastClub');
    console.log(JSON.stringify(clubs, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
