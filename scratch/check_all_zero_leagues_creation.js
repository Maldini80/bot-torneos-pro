import { connectDb, getDb } from '../database.js';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    await connectDb();
    const db = getDb();
    
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: "xpetruu" });
    if (!player) {
        console.log('No xpetruu found');
        process.exit(0);
    }
    
    const leagues = await db.collection('fantasy_leagues').find({
        pointsMode: 'zero',
        status: { $ne: 'closed' }
    }).toArray();
    
    console.log("=== CHECKING ALL ZERO LEAGUES CREATION DATES AND XPETRUU BASEPOINTS ===");
    
    let countZeroBase = 0;
    
    for (const l of leagues) {
        const basePointsMap = l.basePoints || {};
        const eaName = player.eaPlayerName;
        let base = basePointsMap[eaName] ?? basePointsMap[eaName.toLowerCase()];
        
        if (base === 0) {
            countZeroBase++;
            console.log(`- League: "${l.name}" | Created At: ${l.createdAt ? (l.createdAt.toISOString ? l.createdAt.toISOString() : l.createdAt) : 'N/A'} | basePoints: 0`);
        }
    }
    
    console.log(`\nTotal leagues with basePoints = 0 for xpetruu: ${countZeroBase}`);
    process.exit(0);
}

run();
