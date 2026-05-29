import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const testDb = client.db('test');
        const db = client.db('tournamentBotDb');

        console.log('=== SEARCHING SANTAMARIAFC IN TEAMS ===');
        const teams = await testDb.collection('teams').find({
            $or: [
                { name: /santamaria/i },
                { vpgTeamSlug: /santamaria/i }
            ]
        }).toArray();
        console.log(JSON.stringify(teams, null, 2));

        console.log('=== SEARCHING IN vpg_users / player_profiles for SANTAMARIAFC references ===');
        const profiles = await db.collection('player_profiles').find({
            $or: [
                { lastClub: /santamaria/i },
                { "stats.vpgLastRawPerLeague.santamaria": { $exists: true } }
            ]
        }).toArray();
        console.log(JSON.stringify(profiles.map(p => ({ eaPlayerName: p.eaPlayerName, lastClub: p.lastClub })), null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
