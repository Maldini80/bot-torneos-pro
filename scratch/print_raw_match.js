import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const m = await db.collection('scanned_matches').findOne({ matchId: "585050388830115" });
        console.log(JSON.stringify(m, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
