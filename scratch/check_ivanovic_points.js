import { getDb, connectDb } from '../database.js';
import { ObjectId } from 'mongodb';

async function run() {
    await connectDb();
    const db = getDb();
    
    // 1. Get Ivanovic Team
    const teamId = "6a10b2d9f7eee658f4490893";
    const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(teamId) });
    if (!team) {
        console.error("Team not found!");
        process.exit(1);
    }
    
    // 2. Get jam esports league
    const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
    if (!league) {
        console.error("League not found!");
        process.exit(1);
    }
    
    console.log(`=== Ivanovic Team (Points in DB: ${team.points}) ===`);
    console.log(`League: "${league.name}" (Points Mode: ${league.pointsMode})`);
    
    // Collect starters
    const starters = [];
    if (team.lineup) {
        const l = team.lineup;
        if (l.POR) starters.push(l.POR);
        if (Array.isArray(l.DFC)) l.DFC.forEach(p => p && starters.push(p));
        if (Array.isArray(l.MC)) l.MC.forEach(p => p && starters.push(p));
        if (Array.isArray(l.DC)) l.DC.forEach(p => p && starters.push(p));
    }
    
    console.log("\nStarters Points Breakdown:");
    let calculatedSum = 0;
    
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
            
            const leaguePoints = Math.max(0, Math.round((vpgPoints - base) * 10) / 10);
            calculatedSum += leaguePoints;
            
            console.log(` - ${pName}: vpgPoints = ${vpgPoints} | basePoints = ${base} | League Points = ${leaguePoints}`);
        } else {
            console.log(` - ${pName}: NOT FOUND`);
        }
    }
    
    calculatedSum = Math.round(calculatedSum * 10) / 10;
    console.log(`\nCalculated Sum of Starters: ${calculatedSum}`);
    console.log(`Points in DB: ${team.points}`);
    
    process.exit(0);
}

run().catch(console.error);
