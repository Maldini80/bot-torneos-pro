import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const col = db.collection('player_profiles');
        
        console.log('Searching player_profiles for players containing "aaron"...');
        const results = await col.find({ eaPlayerName: /aaron/i }).toArray();
        
        results.forEach(r => {
            console.log(`- ${r.eaPlayerName} (Club: ${r.lastClub}, Division: ${r.vpgLeagueSlug}, Team Slug: ${r.vpgTeamSlug})`);
        });
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
