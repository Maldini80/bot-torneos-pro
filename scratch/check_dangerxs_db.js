// scratch/check_dangerxs_db.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Searching for players matching "danger" ---');
    const players = await db.collection('player_profiles').find({ 
        $or: [
            { eaPlayerName: { $regex: /danger/i } },
            { "vpgProfile.username": { $regex: /danger/i } },
            { "vpgProfile.psn": { $regex: /danger/i } }
        ]
    }).toArray();
    
    console.log(`Found ${players.length} matching players:`);
    players.forEach((p, idx) => {
        console.log(`\nPlayer #${idx + 1}:`);
        console.log(JSON.stringify(p, null, 2));
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
