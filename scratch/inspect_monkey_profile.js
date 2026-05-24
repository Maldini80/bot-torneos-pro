import { connectDb, getDb } from '../database.js';

async function main() {
    await connectDb();
    const testDb = getDb('test');
    
    const targetTeams = ['GUINEA PINK', '90min FC', 'Suzaku esports'];
    const dbTeams = await testDb.collection('teams').find({
        name: { $in: targetTeams }
    }).toArray();
    
    console.log("TEAMS IN DB:");
    for (const t of dbTeams) {
        console.log(`- ${t.name} (vpgLeagueSlug: ${t.vpgLeagueSlug}, eaClubId: ${t.eaClubId})`);
    }
    process.exit(0);
}

main().catch(console.error);
