// scratch/check_fantasy_teams.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const team = await db.collection('fantasy_teams').findOne({});
        console.log('Sample fantasy team document:', JSON.stringify(team, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
