import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- player_profiles matching satita, SweetYanira, Satiiita03:');
        const profiles = await db.collection('player_profiles').find({
            $or: [
                { eaPlayerName: /satita/i },
                { eaPlayerName: /SweetYanira/i },
                { eaPlayerName: /Satiiita03/i }
            ]
        }).toArray();
        console.log(profiles);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
