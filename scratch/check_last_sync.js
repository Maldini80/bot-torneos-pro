import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== CHECKING FANTASY CONFIG ===');
        const config = await db.collection('fantasy_config').findOne({ key: "schedules" });
        console.log('Schedules Configuration:', JSON.stringify(config, null, 2));
        
        console.log('\n=== CHECKING LATEST FANTASY TEAM UPDATES ===');
        const sampleTeams = await db.collection('fantasy_teams')
            .find({ points: { $gt: 0 } })
            .sort({ lastUpdated: -1 })
            .limit(5)
            .toArray();
            
        for (const t of sampleTeams) {
            console.log(`Team: ${t.teamName} | Manager Discord: ${t.discordId}`);
            console.log(` - Points: ${t.points} | Budget: ${t.budget}`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
