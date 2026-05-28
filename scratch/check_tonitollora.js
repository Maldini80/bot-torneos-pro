import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    
    // Find team Tonitollora in fantasy_teams
    const team = await db.collection('fantasy_teams').findOne({ teamName: /Tonitollora/i });
    if (team) {
        console.log(`=== Team: ${team.teamName} ===`);
        console.log(`Points: ${team.points}`);
        console.log("Roster/Players:");
        for (const pName of (team.players || [])) {
            const player = await db.collection('player_profiles').findOne({ eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } });
            if (player) {
                console.log(` - ${pName}: vpgPoints = ${player.stats?.vpgPoints}, matchesPlayed = ${player.stats?.matchesPlayed}`);
            } else {
                console.log(` - ${pName}: NOT FOUND`);
            }
        }
    } else {
        console.log("Team Tonitollora not found!");
    }
    
    process.exit(0);
}

run().catch(console.error);
