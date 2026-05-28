// scratch/check_cc_team.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Checking Team "cc" ---');
    const team = await db.collection('fantasy_teams').findOne({ 
        $or: [
            { teamName: "cc" },
            { teamName: { $regex: /^cc$/i } }
        ]
    });
    
    if (!team) {
        console.log('Team "cc" not found!');
        process.exit(0);
    }
    
    console.log(`Team: "${team.teamName}" (ID: ${team._id}, Discord: ${team.discordId})`);
    console.log(`Players in roster:`, team.players);
    console.log(`Lineup:`, JSON.stringify(team.lineup, null, 2));

    console.log('\n--- Checking "Valdi_17" ---');
    const valdi = await db.collection('player_profiles').findOne({ 
        eaPlayerName: { $regex: /Valdi/i }
    });
    if (valdi) {
        console.log(`Valdi Profile:`, JSON.stringify({
            eaPlayerName: valdi.eaPlayerName,
            vpgLeagueSlug: valdi.vpgLeagueSlug,
            vpgTeamSlug: valdi.vpgTeamSlug,
            stats: valdi.stats
        }, null, 2));
    } else {
        console.log('Valdi not found!');
    }

    console.log('\n--- Checking "raven" (any matches) ---');
    const ravens = await db.collection('player_profiles').find({ 
        $or: [
            { eaPlayerName: { $regex: /raven/i } },
            { "vpgProfile.username": { $regex: /raven/i } },
            { "vpgProfile.psn": { $regex: /raven/i } }
        ]
    }).toArray();
    
    console.log(`Found ${ravens.length} players matching "raven":`);
    ravens.forEach(r => {
        console.log(`- Player: "${r.eaPlayerName}" | VPG: "${r.vpgProfile?.username}" | Club: "${r.lastClub}"`);
        console.log(`  Stats:`, JSON.stringify(r.stats, null, 2));
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
