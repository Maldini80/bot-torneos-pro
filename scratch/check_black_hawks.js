// scratch/check_black_hawks.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Checking Black Hawks in club_profiles ---');
    const profile8701 = await db.collection('club_profiles').findOne({ eaClubId: "8701" });
    const profile7607 = await db.collection('club_profiles').findOne({ eaClubId: "7607" });
    
    console.log(`Profile for 8701:`, JSON.stringify(profile8701, null, 2));
    console.log(`Profile for 7607:`, JSON.stringify(profile7607, null, 2));

    // Let's count player profiles with lastClub "Black Hawks"
    const count = await db.collection('player_profiles').countDocuments({ lastClub: "Black Hawks" });
    console.log(`\nPlayer profiles count with lastClub "Black Hawks": ${count}`);

    // Let's list a few players with lastClub "Black Hawks"
    const players = await db.collection('player_profiles').find({ lastClub: "Black Hawks" }).limit(5).toArray();
    players.forEach(p => {
        console.log(`- Player: ${p.eaPlayerName} | position: ${p.lastPosition}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
