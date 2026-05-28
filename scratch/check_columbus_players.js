import { connectDb, getDb } from '../database.js';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    await connectDb();
    const db = getDb();
    
    // Find all players in Columbus Pacers
    const players = await db.collection('player_profiles').find({
        lastClub: "Columbus Pacers"
    }).toArray();
    
    console.log(`Found ${players.length} players from Columbus Pacers:`);
    for (const p of players) {
        console.log(`- ${p.eaPlayerName} | vpgPoints: ${p.stats?.vpgPoints} | PJ: ${p.stats?.matchesPlayed}`);
    }
    
    // Let's check their basePoints in "STAFF BLITZ"
    const staffBlitz = await db.collection('fantasy_leagues').findOne({ name: "STAFF BLITZ" });
    if (staffBlitz && staffBlitz.basePoints) {
        console.log(`\nBasePoints in STAFF BLITZ:`);
        for (const p of players) {
            const baseVal = staffBlitz.basePoints[p.eaPlayerName] ?? staffBlitz.basePoints[p.eaPlayerName.toLowerCase()] ?? 'Undefined';
            console.log(`- ${p.eaPlayerName}: ${baseVal}`);
        }
    }
    
    process.exit(0);
}

run();
