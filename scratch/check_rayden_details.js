import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "zzRaydenzz";
        const player = await db.collection('player_profiles').findOne({
            eaPlayerName: { $regex: new RegExp('^' + playerName + '$', 'i') }
        });
        
        if (player) {
            console.log('zzRaydenzz Full Stats:');
            console.log(JSON.stringify(player.stats, null, 2));
        } else {
            console.log('Player not found.');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
