import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    
    // Find all fantasy teams that have zzRaydenzz in their roster
    // Let's first search in fantasy_teams
    const teams = await db.collection('fantasy_teams').find({
        $or: [
            { "players": /zzraydenzz/i },
            { "roster": /zzraydenzz/i },
            { "lineup": /zzraydenzz/i },
            { "squad": /zzraydenzz/i },
            { "players.eaPlayerName": /zzraydenzz/i }
        ]
    }).toArray();
    
    console.log(`=== Found ${teams.length} fantasy teams with Rayden ===`);
    for (const team of teams) {
        console.log(`\nTeam ID: ${team._id}, Name: ${team.name}, League: ${team.leagueId}`);
        // Let's check team players / roster
        if (team.players) {
            console.log("Players array snippet:", JSON.stringify(team.players, null, 2));
        }
        if (team.roster) {
            console.log("Roster array snippet:", JSON.stringify(team.roster, null, 2));
        }
        // Let's find the fantasy league for this team
        const league = await db.collection('fantasy_leagues').findOne({ _id: team.leagueId });
        if (league) {
            console.log(`League Settings for league ${league._id}:`);
            console.log(`  Name: ${league.name}`);
            console.log(`  Mode (accumulated/zero): ${league.pointsMode || 'not found'}`);
            console.log(`  basePoints keys:`, league.basePoints ? Object.keys(league.basePoints).filter(k => k.toLowerCase().includes('rayden')) : 'none');
            if (league.basePoints) {
                // Find all keys containing rayden (case insensitive)
                const keys = Object.keys(league.basePoints).filter(k => k.toLowerCase().includes('rayden'));
                keys.forEach(k => {
                    console.log(`    basePoints.${k}: ${league.basePoints[k]}`);
                });
            }
        }
    }
    
    process.exit(0);
}

run().catch(console.error);
