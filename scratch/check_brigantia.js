import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const testDb = client.db('test');
        const team = await testDb.collection('teams').findOne({
            $or: [
                { name: /brigantia/i },
                { vpgTeamSlug: /brigantia/i }
            ]
        });
        console.log('Brigantia Team in test.teams:', JSON.stringify(team, null, 2));

        // Find all player profiles matching AlbertoSG_97
        const p = await db.collection('player_profiles').findOne({ eaPlayerName: 'AlbertoSG_97' });
        console.log('Alberto profile:', JSON.stringify(p, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
