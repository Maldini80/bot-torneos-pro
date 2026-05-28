import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Searching player_profiles for players containing "sati"...');
        const profiles = await db.collection('player_profiles').find({
            $or: [
                { eaPlayerName: /sati/i },
                { "vpgProfile.username": /sati/i }
            ]
        }).toArray();
        
        console.log(`Found ${profiles.length} profiles:`);
        for (const p of profiles) {
            console.log(JSON.stringify(p, null, 2));
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
