import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const uri = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/bot_torneos_vpg';
    console.log(`Connecting to: ${uri.replace(/:([^@]+)@/, ':****@')}`);
    const client = new MongoClient(uri);
    try {
        await client.connect();
        
        // Connect to tournamentBotDb
        const db = client.db('tournamentBotDb');
        console.log(`Connected to DB: ${db.databaseName}`);
        
        const playerColl = db.collection('player_profiles');
        
        const totalPlayers = await playerColl.countDocuments();
        console.log(`Total players in player_profiles: ${totalPlayers}`);
        
        const leagues = await playerColl.distinct('vpgLeagueSlug');
        console.log('Active Leagues in player_profiles:', leagues);
        for (const league of leagues) {
            const count = await playerColl.countDocuments({ vpgLeagueSlug: league });
            console.log(` - ${league}: ${count} players`);
        }
        
        // Let's also check test.teams
        const testDb = client.db('test');
        const teamsColl = testDb.collection('teams');
        const totalTeams = await teamsColl.countDocuments();
        console.log(`Total teams in test.teams: ${totalTeams}`);
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}
run();
