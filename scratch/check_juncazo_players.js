import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();

    console.log('--- CHECKING JUNCAZO LEAGUE SQUAD PLAYERS ---');

    // Get the Juncazo League teams
    const teams = await db.collection('fantasy_teams').find({ leagueId: '6a145ecffa8748ff88c2cfc0' }).toArray();
    
    for (const t of teams) {
        console.log(`\nTeam: "${t.teamName}" (Manager: ${t.discordId})`);
        if (!t.players || t.players.length === 0) {
            console.log('  No players');
            continue;
        }

        for (const playerName of t.players) {
            const player = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });

            if (player) {
                console.log(`  - Player: ${player.eaPlayerName} | Club: ${player.lastClub} | TeamSlug: ${player.vpgTeamSlug} | LeagueSlug: ${player.vpgLeagueSlug}`);
            } else {
                console.log(`  - Player: ${playerName} (NO PROFILE FOUND IN DATABASE)`);
            }
        }
    }

    process.exit(0);
}

run().catch(console.error);
