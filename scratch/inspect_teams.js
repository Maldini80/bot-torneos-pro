import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    const teams = await db.collection('teams').find({ vpgLeagueSlug: { $in: ['superliga-spain-a', 'superliga-spain-b'] } }).toArray();
    console.log('Total teams:', teams.length);
    teams.forEach(t => {
        console.log(`- name: "${t.name}" | vpgTeamSlug: "${t.vpgTeamSlug}" | eaClubId: "${t.eaClubId}" | vpgLeagueSlug: "${t.vpgLeagueSlug}"`);
    });
    await client.close();
}
main().catch(console.error);
