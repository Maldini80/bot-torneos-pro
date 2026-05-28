// scratch/check_manager_teams.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find satiduxgaming teams to get the discordId
    const satiduxTeams = await db.collection('fantasy_teams').find({ 
        teamName: { $regex: /satiduxgaming/i }
    }).toArray();
    
    console.log(`Found ${satiduxTeams.length} teams named satiduxgaming:`);
    if (satiduxTeams.length === 0) {
        console.log('No teams found!');
        process.exit(0);
    }
    
    const discordIds = [...new Set(satiduxTeams.map(t => t.discordId))];
    console.log(`Associated Discord IDs:`, discordIds);
    
    // Search all teams owned by these discord IDs
    for (const dId of discordIds) {
        console.log(`\n========================================`);
        console.log(`Checking Discord ID: ${dId}`);
        console.log(`========================================`);
        
        const teams = await db.collection('fantasy_teams').find({ discordId: dId }).toArray();
        console.log(`This user owns ${teams.length} teams:`);
        
        for (const t of teams) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: t.leagueId });
            const leagueName = league ? league.name : 'Unknown';
            console.log(`\n- Team: "${t.teamName}" in League: "${leagueName}" (ID: ${t.leagueId})`);
            console.log(`  Roster:`, t.players);
            console.log(`  Lineup:`, JSON.stringify(t.lineup, null, 2));
            
            // Check if Valdi or raven is in roster/lineup
            const hasValdi = t.players && t.players.some(p => p.toLowerCase().includes('valdi'));
            const hasRaven = t.players && t.players.some(p => p.toLowerCase().includes('raven'));
            
            console.log(`  Has Valdi in roster: ${hasValdi}`);
            console.log(`  Has raven in roster: ${hasRaven}`);
            
            if (hasValdi) {
                // Find where Valdi is in lineup
                let valdiPos = null;
                for (const pos in t.lineup) {
                    if (Array.isArray(t.lineup[pos]) && t.lineup[pos].some(p => p && p.toLowerCase().includes('valdi'))) {
                        valdiPos = pos;
                    } else if (t.lineup[pos] && t.lineup[pos].toLowerCase().includes('valdi')) {
                        valdiPos = pos;
                    }
                }
                console.log(`  -> Valdi is in lineup at: ${valdiPos}`);
            }
            if (hasRaven) {
                // Find where raven is in lineup
                let ravenPos = null;
                for (const pos in t.lineup) {
                    if (Array.isArray(t.lineup[pos]) && t.lineup[pos].some(p => p && p.toLowerCase().includes('raven'))) {
                        ravenPos = pos;
                    } else if (t.lineup[pos] && t.lineup[pos].toLowerCase().includes('raven')) {
                        ravenPos = pos;
                    }
                }
                console.log(`  -> Raven is in lineup at: ${ravenPos}`);
            }
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
