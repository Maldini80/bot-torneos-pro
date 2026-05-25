import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Scanning all active fantasy leagues for rostered players with division mismatches...');
        
        // Get all active leagues in config
        let activeLeaguesSlugs = [];
        const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
        if (config && Array.isArray(config.slugs)) {
            activeLeaguesSlugs = config.slugs;
        } else {
            activeLeaguesSlugs = ["superliga-spain-a", "superliga-spain-b"];
        }
        
        // Find all fantasy teams in active leagues
        const fantasyLeagues = await db.collection('fantasy_leagues').find({}).toArray();
        console.log(`Found ${fantasyLeagues.length} fantasy leagues.`);
        
        let totalMismatched = 0;
        
        for (const fLeague of fantasyLeagues) {
            const leagueId = fLeague._id.toString();
            // What divisions should players in this league have?
            const allowedDivisions = fLeague.vpgLeagues || activeLeaguesSlugs;
            
            const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
            for (const team of teams) {
                if (!Array.isArray(team.players)) continue;
                
                for (const playerName of team.players) {
                    const playerProfile = await db.collection('player_profiles').findOne({ 
                        eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } 
                    });
                    
                    if (!playerProfile) {
                        console.log(`- Warning: Player "${playerName}" in team "${team.teamName}" (League: "${fLeague.name}") has NO profile in player_profiles!`);
                        totalMismatched++;
                        continue;
                    }
                    
                    // Check if player profile division is in the allowed divisions of this league
                    if (playerProfile.vpgLeagueSlug && !allowedDivisions.includes(playerProfile.vpgLeagueSlug)) {
                        console.log(`- Mismatch: Player "${playerProfile.eaPlayerName}" in team "${team.teamName}" (League: "${fLeague.name}") has division profile "${playerProfile.vpgLeagueSlug}" but league allowed divisions are [${allowedDivisions.join(', ')}]`);
                        totalMismatched++;
                    }
                }
            }
        }
        
        console.log(`\nScan complete. Found ${totalMismatched} total mismatched/missing player profiles.`);
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
