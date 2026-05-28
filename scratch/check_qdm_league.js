// scratch/check_qdm_league.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find fantasy leagues tracking VPG leagues
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    console.log(`Found ${leagues.length} fantasy leagues.`);
    
    for (const l of leagues) {
        // Find if this player is in any teams of this league
        const team = await db.collection('fantasy_teams').findOne({ 
            leagueId: l._id.toString(),
            players: { $regex: /^xDoku_11$/i }
        });
        
        if (team) {
            console.log(`\nLeague: "${l.name}" (ID: ${l._id})`);
            console.log(`- Tracking VPG leagues (config):`, l.vpgLeagueSlugs || 'Default (all active)');
            console.log(`- Player owned by: "${team.teamName}" (Discord: ${team.discordId})`);
            
            // Check if player is starter in the lineup
            const isStarter = team.lineup && (
                team.lineup.POR === 'xDoku_11' ||
                (team.lineup.DFC && team.lineup.DFC.includes('xDoku_11')) ||
                (team.lineup.MC && team.lineup.MC.includes('xDoku_11')) ||
                (team.lineup.DC && team.lineup.DC.includes('xDoku_11'))
            );
            console.log(`- Is starter: ${isStarter}`);
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
