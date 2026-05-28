// scratch/find_inflated_players.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('--- Searching for players with multiple divisions ---');
    const players = await db.collection('player_profiles').find({
        "stats.vpgLastRawPerLeague": { $exists: true }
    }).toArray();
    
    console.log(`Found ${players.length} players with per-league stats.`);
    
    let count = 0;
    for (const p of players) {
        const stats = p.stats;
        const perLeague = stats.vpgLastRawPerLeague || {};
        const leagues = Object.keys(perLeague);
        
        if (leagues.length > 1) {
            let sumPoints = 0;
            leagues.forEach(l => {
                sumPoints += perLeague[l].vpgPoints || 0;
            });
            sumPoints = Math.round(sumPoints * 10) / 10;
            
            const dbPoints = stats.vpgPoints || 0;
            const diff = Math.abs(dbPoints - sumPoints);
            
            if (diff > 1.0) {
                console.log(`\n🚨 Player: "${p.eaPlayerName}" (ID: ${p._id})`);
                console.log(`- Division: ${p.vpgLeagueSlug} | Team: ${p.lastClub}`);
                console.log(`- Leagues tracked:`, leagues);
                console.log(`- Sum of leagues: ${sumPoints} points`);
                console.log(`- DB vpgPoints: ${dbPoints} points (Inflated by: ${Math.round((dbPoints - sumPoints) * 10) / 10} points)`);
                count++;
            }
        }
    }
    
    console.log(`\nTotal inflated players found: ${count}`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
