import { MongoClient } from 'mongodb';
import 'dotenv/config';

function findPath(obj, target, currentPath = '') {
    if (typeof obj === 'string') {
        if (obj.toLowerCase() === target.toLowerCase()) {
            console.log(`FOUND PATH: ${currentPath} = "${obj}"`);
        }
        return;
    }
    if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
            findPath(obj[k], target, currentPath ? `${currentPath}.${k}` : k);
        }
    }
}

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const m = await db.collection('scanned_matches').findOne({ matchId: "585050388830115" });
        if (m) {
            findPath(m, 'Uriii-07-');
        } else {
            console.log('Match not found');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
