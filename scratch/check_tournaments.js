// scratch/check_tournaments.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Sample tournaments Documents ---');
    const tours = await db.collection('tournaments').find({}).limit(2).toArray();
    console.log(JSON.stringify(tours, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
