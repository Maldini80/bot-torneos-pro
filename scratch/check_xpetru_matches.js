import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    await connectDb();
    const db = getDb();
    
    // Find player creation date from ObjectId
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: "xpetruu" });
    if (!player) {
        console.log('No xpetruu found');
        process.exit(0);
    }
    
    const objectIdTime = player._id.getTimestamp();
    console.log(`Creation time of xpetruu profile in database: ${objectIdTime.toISOString()}`);
    
    // Check if xpetruu is in scanned_matches
    const nameLower = player.eaPlayerName.toLowerCase();
    const matches = await db.collection('scanned_matches').find({}).toArray();
    
    let matchesFound = [];
    for (const m of matches) {
        for (const clubId in m.players || {}) {
            for (const pId in m.players[clubId]) {
                const p = m.players[clubId][pId];
                if ((p.playername || p.playerName || '').toLowerCase().trim() === nameLower) {
                    matchesFound.push({
                        matchId: m.matchId,
                        date: m.matchDate || m.createdAt,
                        clubName: m.clubs?.[clubId]?.name,
                        rating: p.rating,
                        goals: p.goals
                    });
                }
            }
        }
    }
    
    console.log(`\nFound ${matchesFound.length} matches in scanned_matches:`);
    matchesFound.forEach(m => console.log(`- Match ID: ${m.matchId} | Date: ${m.date} | Club: ${m.clubName} | Rating: ${m.rating}`));

    process.exit(0);
}

run();
