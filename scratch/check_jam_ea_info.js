import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Searching for JAM Esports in teams collection...');
        const teams = await db.collection('teams').find({ name: /JAM/i }).toArray();
        for (const t of teams) {
            console.log(`Team Name: "${t.name}"`);
            console.log(`  - _id: ${t._id}`);
            console.log(`  - eaClubId: "${t.eaClubId}"`);
            console.log(`  - eaPlatform: "${t.eaPlatform}"`);
            console.log(`  - vpgLeagueSlug: "${t.vpgLeagueSlug}"`);
            console.log(`  - vpgTeamSlug: "${t.vpgTeamSlug}"`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
