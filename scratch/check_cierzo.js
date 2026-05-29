import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const testDb = client.db('test');
        const db = client.db('tournamentBotDb');

        console.log('=== SEARCHING CIERZO IN TEAMS ===');
        const teams = await testDb.collection('teams').find({
            $or: [
                { name: /cierzo/i },
                { vpgTeamSlug: /cierzo/i }
            ]
        }).toArray();
        console.log(JSON.stringify(teams, null, 2));

        console.log('\n=== SEARCHING CIERZO IN FANTASY CONFIG LEAGUES ===');
        const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
        const leagues = config ? config.slugs : [];

        for (const league of leagues) {
            const tableUrl = `https://api.virtualprogaming.com/public/leagues/${league}/table/`;
            const res = await fetch(tableUrl, { headers: { 'User-Agent': 'VPG/1.0.0' } });
            if (res.ok) {
                const table = await res.json();
                const found = table.find(t => t.team_name && t.team_name.toLowerCase().includes('cierzo'));
                if (found) {
                    console.log(`Found Cierzo in league ${league}:`, JSON.stringify(found, null, 2));
                }
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
