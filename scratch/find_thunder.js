// scratch/find_thunder.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Searching for "Thunder" in Database ---');
    
    // Check club_profiles
    const clubs = await db.collection('club_profiles').find({
        $or: [
            { eaClubName: { $regex: /thunder/i } },
            { name: { $regex: /thunder/i } }
        ]
    }).toArray();
    console.log(`Club Profiles containing "Thunder": ${clubs.length}`);
    clubs.forEach(c => console.log(`- ${c.eaClubName} (ID: ${c.eaClubId})`));

    // Check player_profiles (lastClub)
    const players = await db.collection('player_profiles').find({
        lastClub: { $regex: /thunder/i }
    }).limit(5).toArray();
    console.log(`Player Profiles with club "Thunder" (sample): ${players.length}`);
    players.forEach(p => console.log(`- Player: ${p.eaPlayerName} | Club: ${p.lastClub}`));

    // Check tournaments
    const tournaments = await db.collection('tournaments').find({
        $or: [
            { "teams.nombre": { $regex: /thunder/i } },
            { "teams.eafcTeamName": { $regex: /thunder/i } }
        ]
    }).toArray();
    console.log(`Tournaments containing "Thunder": ${tournaments.length}`);
    tournaments.forEach(t => {
        console.log(`- Tournament: ${t.name || t.title || t._id}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
