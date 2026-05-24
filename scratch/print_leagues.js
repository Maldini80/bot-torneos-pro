import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const uri = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/bot_torneos_vpg';
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const leaguesList = await db.collection('fantasy_leagues').find().toArray();
        console.log(JSON.stringify(leaguesList, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}
run();
