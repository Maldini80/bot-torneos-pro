import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Searching player_profiles for ferstar...');
        const ferstar = await db.collection('player_profiles').findOne({
            eaPlayerName: { $regex: /ferstar/i }
        });
        
        if (ferstar) {
            console.log('Found profile:', JSON.stringify(ferstar, null, 2));
        } else {
            console.log('Player not found in player_profiles.');
            
            // Search in verified_users
            const verified = await db.collection('verified_users').find({
                $or: [
                    { username: /ferstar/i },
                    { psnId: /ferstar/i },
                    { gameId: /ferstar/i }
                ]
            }).toArray();
            console.log('Verified Users results:', verified);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
