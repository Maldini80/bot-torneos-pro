import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const leagueId = league._id.toString();
    const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
    
    console.log(`Analyzing compensation impact on all teams...\n`);
    
    for (const team of teams) {
        // Let's find out how many starters they had in their lineup when we sync
        const starters = {};
        const lineup = team.lineup || {};
        if (lineup.POR) starters[lineup.POR.toLowerCase()] = true;
        if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && (starters[p.toLowerCase()] = true));
        if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && (starters[p.toLowerCase()] = true));
        if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && (starters[p.toLowerCase()] = true));
        
        const numStarters = Object.keys(starters).length;
        
        // Let's calculate the reversion amount if they had < 11 starters
        let prevCompPoints = 0;
        let prevCompCoins = 0;
        if (numStarters < 11 && team.players && team.players.length > 0 && numStarters > 0) {
            prevCompPoints = Math.round(numStarters * 16.05 * 10) / 10;
            prevCompCoins = prevCompPoints * 80000;
        }
        
        console.log(`Team: ${team.teamName}`);
        console.log(`  Starters: ${numStarters}/11`);
        console.log(`  Calculated Reversion Points: -${prevCompPoints} pts`);
        console.log(`  Calculated Reversion Balance: -${prevCompCoins.toLocaleString()} €`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
