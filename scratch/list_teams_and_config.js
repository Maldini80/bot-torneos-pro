import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const defaultDb = client.db('tournamentBotDb');
        const configColl = defaultDb.collection('fantasy_config');
        const configs = await configColl.find({}).toArray();
        console.log('Existing fantasy_config:', JSON.stringify(configs, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
