// scratch/find_all_inflated_any.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Finding all players with any stats mismatch ---');
    const players = await db.collection('player_profiles').find({
        "stats.vpgLastRawPerLeague": { $exists: true }
    }).toArray();
    
    console.log(`Found ${players.length} players with per-league stats.`);
    
    let count = 0;
    for (const p of players) {
        const stats = p.stats;
        const perLeague = stats.vpgLastRawPerLeague || {};
        const leagues = Object.keys(perLeague);
        
        let sumPoints = 0;
        leagues.forEach(l => {
            sumPoints += perLeague[l].vpgPoints || 0;
        });
        sumPoints = Math.round(sumPoints * 10) / 10;
        
        const dbPoints = stats.vpgPoints || 0;
        const diff = Math.abs(dbPoints - sumPoints);
        
        if (diff > 1.0) {
            console.log(`\n🚨 Mismatch Player: "${p.eaPlayerName}" (${p._id})`);
            console.log(`- Leagues:`, leagues);
            console.log(`- Sum of leagues: ${sumPoints} points`);
            console.log(`- DB vpgPoints: ${dbPoints} points (Diff: ${Math.round((dbPoints - sumPoints) * 10) / 10} points)`);
            count++;
        }
    }
    
    console.log(`\nTotal mismatch players found: ${count}`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
