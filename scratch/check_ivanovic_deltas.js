import { getDb, connectDb } from '../database.js';
import { ObjectId } from 'mongodb';

async function run() {
    await connectDb();
    const db = getDb();
    
    const teamId = "6a10b2d9f7eee658f4490893";
    const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(teamId) });
    if (!team) {
        console.error("Team not found!");
        process.exit(1);
    }
    
    const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
    if (!league) {
        console.error("League not found!");
        process.exit(1);
    }
    
    console.log(`=== Ivanovic Team: Breakdown of Deltas (Points Gained in Sync) ===`);
    
    // Collect starters
    const starters = [];
    if (team.lineup) {
        const l = team.lineup;
        if (l.POR) starters.push(l.POR);
        if (Array.isArray(l.DFC)) l.DFC.forEach(p => p && starters.push(p));
        if (Array.isArray(l.MC)) l.MC.forEach(p => p && starters.push(p));
        if (Array.isArray(l.DC)) l.DC.forEach(p => p && starters.push(p));
    }
    
    // We want to simulate the delta calculation. 
    // Since we know the previous stats of zzRaydenzz (which was 64.2 VPG points), 
    // let's check his delta, and for other players we can fetch their current stats.
    // Wait, what were the VPG points of other players before the sync?
    // Let's print their current stats first.
    console.log("\nStarters current database stats:");
    let totalTeamDelta = 0;
    
    for (const pName of starters) {
        const player = await db.collection('player_profiles').findOne({ 
            eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } 
        });
        
        if (player) {
            const vpgPoints = player.stats?.vpgPoints || 0;
            let base = 0;
            if (league.basePoints) {
                base = league.basePoints[player.eaPlayerName] ?? league.basePoints[player.eaPlayerName.toLowerCase()] ?? 0;
            }
            const currentLeaguePoints = Math.max(0, Math.round((vpgPoints - base) * 10) / 10);
            
            // For Rayden, we know his oldVpgPoints was 64.2. So let's calculate his delta.
            // For other players, if they didn't have division conflicts, their stats were updated by the crawl.
            let oldVpgPoints = vpgPoints; // if no matches played yesterday, old = new
            if (pName.toLowerCase() === 'zzraydenzz') {
                oldVpgPoints = 55.2; // Rayden's old VPG points before yesterday's matches (75.1 - 19.9)
            }
            
            const oldLeaguePoints = Math.max(0, Math.round((oldVpgPoints - base) * 10) / 10);
            const delta = Math.max(0, Math.round((currentLeaguePoints - oldLeaguePoints) * 10) / 10);
            totalTeamDelta += delta;
            
            console.log(` - ${pName}:`);
            console.log(`    * VPG Points (Antes -> Ahora): ${oldVpgPoints} -> ${vpgPoints}`);
            console.log(`    * Base Points en la liga: ${base}`);
            console.log(`    * Puntos Liga (Antes -> Ahora): ${oldLeaguePoints} -> ${currentLeaguePoints}`);
            console.log(`    * Delta ganado: +${delta} pts`);
        } else {
            console.log(` - ${pName}: NOT FOUND`);
        }
    }
    
    console.log(`\nSuma total de deltas ganados por el equipo hoy: +${totalTeamDelta} pts`);
    
    process.exit(0);
}

run().catch(console.error);
