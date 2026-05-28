import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();

    const names = ['aaron', 'juanri', 'monkey'];
    console.log('Searching for players matching names:', names);

    for (const name of names) {
        const matchingPlayers = await db.collection('player_profiles').find({
            eaPlayerName: { $regex: new RegExp(name, 'i') }
        }).toArray();

        console.log(`\nMatches for "${name}": ${matchingPlayers.length}`);
        for (const player of matchingPlayers) {
            console.log(`  - Profile: ${player.eaPlayerName} | Club: ${player.lastClub} | TeamSlug: ${player.vpgTeamSlug} | LeagueSlug: ${player.vpgLeagueSlug}`);
            
            // Find teams containing this player in fantasy_teams
            const teams = await db.collection('fantasy_teams').find({
                players: player.eaPlayerName
            }).toArray();

            console.log(`    Rostered in ${teams.length} fantasy teams:`);
            for (const team of teams) {
                const league = await db.collection('fantasy_leagues').findOne({
                    _id: team.leagueId.toString()
                });
                console.log(`      * Team: "${team.teamName}" | League: "${league ? league.name : 'Unknown'}" (ID: ${team.leagueId})`);
            }
        }
    }

    process.exit(0);
}

run().catch(console.error);
