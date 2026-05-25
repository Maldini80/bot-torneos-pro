import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const col = db.collection('player_profiles');
        
        console.log('Updating MonKeyDFFYLU to Superliga B / GUINEA PINK...');
        const result = await col.updateOne(
            { eaPlayerName: 'MonKeyDFFYLU' },
            { 
                $set: { 
                    vpgLeagueSlug: 'superliga-spain-b',
                    lastClub: 'GUINEA PINK',
                    vpgTeamSlug: 'guinea-pink'
                } 
            }
        );
        
        console.log('Update result:', result);
        
        // Fetch to verify
        const updated = await col.findOne({ eaPlayerName: 'MonKeyDFFYLU' });
        console.log('Updated profile:', updated);
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
