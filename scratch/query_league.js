import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Querying league 6a1165ac92863afdcad3676f...');
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId('6a1165ac92863afdcad3676f') });
        console.log(JSON.stringify(league, null, 2));
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
