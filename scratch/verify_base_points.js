import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        // Find one league and inspect its basePoints
        const league = await db.collection('fantasy_leagues').findOne({ name: "jam esports" });
        if (league && league.basePoints) {
            console.log(`=== Base Points for League: "${league.name}" ===`);
            const entries = Object.entries(league.basePoints);
            console.log(`Total players in basePoints: ${entries.length}`);
            
            // Print a sample of 15 players and their basePoints
            console.log("Sample of 15 players basePoints:");
            console.log(JSON.stringify(entries.slice(0, 15), null, 2));
            
            // Verify Rayden specifically
            console.log(`zzRaydenzz basePoints: ${league.basePoints["zzRaydenzz"]}`);
        } else {
            console.log("League or basePoints not found.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
