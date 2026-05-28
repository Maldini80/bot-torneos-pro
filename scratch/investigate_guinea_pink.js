import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();

    console.log('--- INVESTIGATING GUINEA PINK PLAYERS ---');

    // Find all player profiles that match club "GUINEA PINK" (case-insensitive) or team slug "guinea-pink"
    const players = await db.collection('player_profiles').find({
        $or: [
            { lastClub: /guinea/i },
            { vpgTeamSlug: 'guinea-pink' },
            { eaPlayerName: { $in: ['MonKeyDFFYLU', 'Aaron14', 'TSX-Juanri2'] } }
        ]
    }).toArray();

    console.log(`Found ${players.length} players associated with Guinea Pink:`);

    for (const player of players) {
        console.log(`\nPlayer: ${player.eaPlayerName}`);
        console.log(`  - vpgLeagueSlug: ${player.vpgLeagueSlug}`);
        console.log(`  - vpgTeamSlug: ${player.vpgTeamSlug}`);
        console.log(`  - lastClub: ${player.lastClub}`);
        console.log(`  - VPG Profile:`, player.vpgProfile);

        // Find teams containing this player in fantasy_teams
        const teams = await db.collection('fantasy_teams').find({
            players: player.eaPlayerName
        }).toArray();

        console.log(`  - Rostered in ${teams.length} fantasy teams:`);
        for (const team of teams) {
            const league = await db.collection('fantasy_leagues').findOne({
                $or: [
                    { _id: team.leagueId },
                    { _id: typeof team.leagueId === 'string' ? null : team.leagueId }
                ]
            }) || await db.collection('fantasy_leagues').findOne({
                // try matching by string ID
                _id: team.leagueId.toString()
            });

            console.log(`    * Team: "${team.teamName}" | League: "${league ? league.name : 'Unknown'}" (ID: ${team.leagueId}) | Balance: ${team.balance}`);
        }
    }

    process.exit(0);
}

run().catch(console.error);
