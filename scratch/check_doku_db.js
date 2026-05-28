// scratch/check_doku_db.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Checking xDoku_11 in player_profiles ---');
    const player = await db.collection('player_profiles').findOne({ 
        $or: [
            { vpgProfileId: "573566" },
            { eaPlayerName: "xRubenPrieto-_-" },
            { eaPlayerName: "xDoku_11" },
            { vpgProfileId: 573566 }
        ]
    });
    
    console.log(`Player profile:`, JSON.stringify(player, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
