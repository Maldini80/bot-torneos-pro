import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const testDb = getDb('test');

    console.log('=== Teams in segunda-division-a-spain ===');
    const teams = await testDb.collection('teams').find({
        vpgLeagueSlug: "segunda-division-a-spain"
    }).toArray();

    for (const t of teams) {
        console.log(`- Team: "${t.name}" | Slug: "${t.vpgTeamSlug}" | ID: ${t._id} | EA Club ID: ${t.eaClubId}`);
    }

    console.log('\n=== Rysix-specific search in testDb.teams ===');
    const rysixTeams = await testDb.collection('teams').find({
        $or: [
            { name: /rysix/i },
            { vpgTeamSlug: /rysix/i }
        ]
    }).toArray();
    for (const rt of rysixTeams) {
        console.log('Found Rysix team in testDb:', JSON.stringify(rt, null, 2));
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
