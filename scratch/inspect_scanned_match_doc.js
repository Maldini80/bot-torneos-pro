import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const match = await db.collection('scanned_matches').findOne({});
        console.log("=== ONE SCANNED MATCH DOCUMENT ===");
        if (match) {
            console.log(JSON.stringify(match, null, 2).substring(0, 3000));
        } else {
            console.log("No matches found in scanned_matches collection.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
