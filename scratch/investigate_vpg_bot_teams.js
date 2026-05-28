import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    // VPG bot uses 'test' db for teams
    const db = getDb('test');

    console.log('--- INVESTIGATING VPG BOT TEAMS ---');

    // 1. Search for Guinea Pink team
    const gpTeam = await db.collection('teams').findOne({
        name: /guinea/i
    });

    if (gpTeam) {
        console.log(`Guinea Pink Team: "${gpTeam.name}" (ID: ${gpTeam._id})`);
        console.log(`  - vpgTeamSlug: ${gpTeam.vpgTeamSlug}`);
        console.log(`  - vpgLeagueSlug: ${gpTeam.vpgLeagueSlug}`);
        console.log(`  - Manager ID: ${gpTeam.managerId}`);
        console.log(`  - Captains:`, gpTeam.captains);
        console.log(`  - Players (${gpTeam.players ? gpTeam.players.length : 0}):`, gpTeam.players);
    } else {
        console.log('Guinea Pink team not found in test.teams');
    }

    // 2. Search for the players in all teams in the teams collection
    const targetPlayers = ['MonKeyDFFYLU', 'Aaron14', 'TSX-Juanri2'];
    console.log('\nSearching for target players in all teams roster:');
    
    const allTeams = await db.collection('teams').find({}).toArray();
    for (const player of targetPlayers) {
        console.log(`\nPlayer "${player}":`);
        const matchingTeams = allTeams.filter(t => t.players && t.players.some(p => p.toLowerCase() === player.toLowerCase()));
        if (matchingTeams.length > 0) {
            for (const t of matchingTeams) {
                console.log(`  - Rostered in team: "${t.name}" (League: ${t.vpgLeagueSlug})`);
            }
        } else {
            console.log('  - Not found in any team players roster');
        }
    }

    process.exit(0);
}

run().catch(console.error);
