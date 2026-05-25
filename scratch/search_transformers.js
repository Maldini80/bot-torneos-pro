import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        const testDb = client.db('test');
        const db = client.db('tournamentBotDb');
        
        console.log('Searching for teams containing "transformers" in test database...');
        const testTeams = await testDb.collection('teams').find({ name: /transformers/i }).toArray();
        testTeams.forEach(t => {
            console.log(`- Team (test): ${t.name} (vpgLeagueSlug: ${t.vpgLeagueSlug}, vpgTeamSlug: ${t.vpgTeamSlug}, eaClubId: ${t.eaClubId})`);
        });
        
        console.log('\nSearching for fantasy teams containing "transformers" in tournamentBotDb...');
        const fantasyTeams = await db.collection('fantasy_teams').find({ teamName: /transformers/i }).toArray();
        fantasyTeams.forEach(t => {
            console.log(`- Fantasy Team: ${t.teamName} (League ID: ${t.leagueId}, players: ${t.players?.length} players)`);
            console.log(`  Players:`, t.players);
        });
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
