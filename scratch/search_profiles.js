import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const col = db.collection('player_profiles');
        
        console.log('Searching player_profiles for similar names...');
        
        // Search by regex
        const searchRegexes = [
            /luffy/i,
            /dffy/i,
            /monkey/i,
            /monssen/i
        ];
        
        for (const regex of searchRegexes) {
            console.log(`\nResults for regex: ${regex}`);
            const results = await col.find({ eaPlayerName: regex }).toArray();
            if (results.length > 0) {
                results.forEach(r => {
                    console.log(`- ${r.eaPlayerName} (Position: ${r.lastPosition}, Club: ${r.lastClub}, League: ${r.vpgLeagueSlug})`);
                });
            } else {
                console.log('No results.');
            }
        }
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
