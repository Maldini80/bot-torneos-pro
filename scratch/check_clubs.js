// scratch/check_clubs.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Sample club_profiles Documents ---');
    const clubs = await db.collection('club_profiles').find({}).limit(5).toArray();
    console.log(JSON.stringify(clubs, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
