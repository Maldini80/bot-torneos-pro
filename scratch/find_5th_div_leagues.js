import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();

    console.log('--- FINDING LEAGUES WITH 5TH DIVISION ---');

    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    for (const l of leagues) {
        const contains5th = l.vpgLeagues && l.vpgLeagues.some(slug => slug.includes('quinta') || slug.includes('5'));
        if (contains5th || l.name.includes('5') || l.name.toLowerCase().includes('quinta')) {
            console.log(`\nLeague: "${l.name}" (ID: ${l._id})`);
            console.log(`  - CreatedBy: ${l.createdByUsername} (${l.createdBy})`);
            console.log(`  - vpgLeagues:`, l.vpgLeagues);
            console.log(`  - Approved: ${l.approved}`);
            console.log(`  - CreatedAt: ${l.createdAt}`);

            // Find teams in this league
            const teams = await db.collection('fantasy_teams').find({ leagueId: l._id.toString() }).toArray();
            console.log(`  - Teams in this league (${teams.length}):`);
            for (const t of teams) {
                console.log(`    * Team: "${t.teamName}" | Manager Discord: ${t.discordId} | Players Count: ${t.players ? t.players.length : 0}`);
                if (t.players && t.players.length > 0) {
                    console.log(`      Players:`, t.players);
                }
            }
        }
    }

    process.exit(0);
}

run().catch(console.error);
