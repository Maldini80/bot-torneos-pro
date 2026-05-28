import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();

    const marcosDiscordId = '247446101064417280';
    console.log(`--- INSPECTING TEAMS FOR MARCOS/ZANATOIDE (${marcosDiscordId}) ---`);

    const teams = await db.collection('fantasy_teams').find({ discordId: marcosDiscordId }).toArray();
    console.log(`Found ${teams.length} fantasy teams managed by Marcos:`);

    for (const t of teams) {
        const league = await db.collection('fantasy_leagues').findOne({ _id: t.leagueId.toString() });
        console.log(`\nTeam: "${t.teamName}" | League: "${league ? league.name : 'Unknown'}" (ID: ${t.leagueId})`);
        console.log(`  Roster (${t.players ? t.players.length : 0}):`, t.players);
        
        // Let's print details of each player in his roster
        if (t.players) {
            for (const pName of t.players) {
                const player = await db.collection('player_profiles').findOne({
                    eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
                });
                if (player) {
                    console.log(`    - ${player.eaPlayerName} | Club: ${player.lastClub} | LeagueSlug: ${player.vpgLeagueSlug}`);
                } else {
                    console.log(`    - ${pName} (NO PROFILE IN DB)`);
                }
            }
        }
    }

    process.exit(0);
}

run().catch(console.error);
