// scratch/check_juanri_db.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Checking TSX-JUANRI2 in player_profiles ---');
    const player = await db.collection('player_profiles').findOne({ 
        $or: [
            { eaPlayerName: { $regex: /juanri/i } },
            { "vpgProfile.username": { $regex: /juanri/i } },
            { "vpgProfile.psn": { $regex: /juanri/i } }
        ]
    });
    
    console.log(`Player profile:`, JSON.stringify(player, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
