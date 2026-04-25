import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.client.db('test');
    
    // Get one raw match
    const match = await db.collection('scanned_matches').findOne({}, { sort: { timestamp: -1 } });
    if (!match) { console.log('No matches found'); process.exit(0); }
    
    const clubIds = Object.keys(match.clubs || {});
    console.log('=== MATCH KEYS ===');
    console.log('Match ID:', match.matchId);
    console.log('Club IDs:', clubIds);
    
    // Show club-level keys  
    const firstClubId = clubIds[0];
    if (firstClubId) {
        console.log('\n=== CLUB DATA KEYS ===');
        console.log(JSON.stringify(match.clubs[firstClubId], null, 2));
    }
    
    // Show player-level keys
    if (match.players && match.players[firstClubId]) {
        const playerIds = Object.keys(match.players[firstClubId]);
        console.log('\n=== FIRST PLAYER DATA KEYS ===');
        console.log(JSON.stringify(match.players[firstClubId][playerIds[0]], null, 2));
    }

    // Check a club_profile
    console.log('\n=== CLUB PROFILE (first) ===');
    const clubProfile = await db.collection('club_profiles').findOne({});
    if (clubProfile) console.log(JSON.stringify(clubProfile, null, 2).substring(0, 1500));

    // Check a player_profile
    console.log('\n=== PLAYER PROFILE (first) ===');
    const playerProfile = await db.collection('player_profiles').findOne({});
    if (playerProfile) console.log(JSON.stringify(playerProfile, null, 2).substring(0, 1500));

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
