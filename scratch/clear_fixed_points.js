// scratch/clear_fixed_points.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Clearing Fixed Points in DB ---');
    const res = await db.collection('player_profiles').updateMany(
        { points: { $ne: undefined } },
        { $unset: { points: "" } }
    );
    
    console.log(`Successfully cleared fixed points for ${res.modifiedCount} player documents.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
