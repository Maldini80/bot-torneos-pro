import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();

    const db = client.db('test');
    const teams = ['Sinfonicos FC', 'GUINEA PINK', '90min FC', 'Suzaku esports'];
    
    for (const name of teams) {
        const team = await db.collection('teams').findOne({ name });
        if (team) {
            console.log(`Team: "${team.name}" | vpgLeagueSlug: "${team.vpgLeagueSlug}" | EA Club ID: ${team.eaClubId}`);
        } else {
            console.log(`Team: "${name}" NOT found in test.teams`);
        }
    }
    
    await client.close();
}

main().catch(console.error);
