import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
        console.log('Active Leagues in Config:', config);
        
        const teams = await db.collection('teams').find({}).toArray();
        console.log('Sample VPG Spain teams with community/league settings:');
        const jam = await db.collection('test').collection('teams').findOne({ name: /jam/i });
        console.log('JAM eSports community settings in test.teams:', jam ? { guildId: jam.guildId, eaClubId: jam.eaClubId } : 'Not found');
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
