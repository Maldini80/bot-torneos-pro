import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const player = await db.collection('player_profiles').findOne({
            eaPlayerName: /zzRaydenzz/i
        });
        console.log("=== RAYDEN PROFILE ===");
        console.log(JSON.stringify(player, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
