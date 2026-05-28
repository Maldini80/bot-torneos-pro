import { connectDb, getDb } from '../database.js';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    await connectDb();
    const db = getDb();
    
    // Let's take a sample of the 52 leagues where xpetruu has basePoints = 0
    const sampleLeagueNames = ["STAFF BLITZ", "Ceuta Guardians", "IMPERIO GITANO", "Cryzen gaming"];
    
    console.log("=== CHECKING SAMPLE LEAGUES RESET/CREATION DETAILS ===");
    for (const name of sampleLeagueNames) {
        const league = await db.collection('fantasy_leagues').findOne({ name });
        if (!league) {
            console.log(`League "${name}" not found.`);
            continue;
        }
        
        console.log(`\nLeague: "${league.name}" (ID: ${league._id})`);
        console.log(`- Created At: ${league.createdAt ? (league.createdAt.toISOString ? league.createdAt.toISOString() : league.createdAt) : 'N/A'}`);
        console.log(`- Points Mode: ${league.pointsMode}`);
        console.log(`- basePoints size: ${league.basePoints ? Object.keys(league.basePoints).length : 0}`);
        
        // Let's fetch the oldest and newest news in this league to see the activity timeline
        const oldestNews = await db.collection('fantasy_news').find({ leagueId: league._id.toString() }).sort({ createdAt: 1 }).limit(2).toArray();
        const newestNews = await db.collection('fantasy_news').find({ leagueId: league._id.toString() }).sort({ createdAt: -1 }).limit(2).toArray();
        
        console.log(`- Oldest news:`);
        oldestNews.forEach(n => {
            const timeStr = n.createdAt ? (n.createdAt.toISOString ? n.createdAt.toISOString() : String(n.createdAt)) : 'No time';
            console.log(`  * [${timeStr}] ${n.message}`);
        });
        console.log(`- Newest news:`);
        newestNews.forEach(n => {
            const timeStr = n.createdAt ? (n.createdAt.toISOString ? n.createdAt.toISOString() : String(n.createdAt)) : 'No time';
            console.log(`  * [${timeStr}] ${n.message}`);
        });
    }
    
    process.exit(0);
}

run();
