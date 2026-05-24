// scratch/distinct_positions.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const positions = await db.collection('player_profiles').distinct('lastPosition');
    console.log('Distinct player positions:', positions);

    // Let's count players per position
    for (const pos of positions) {
        const count = await db.collection('player_profiles').countDocuments({ lastPosition: pos });
        console.log(`Position ${pos}: ${count} players`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
