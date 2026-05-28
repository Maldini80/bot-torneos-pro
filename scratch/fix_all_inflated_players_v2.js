// scratch/fix_all_inflated_players_v2.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    const playerColl = db.collection('player_profiles');
    
    console.log('--- Finding all mismatching player profiles ---');
    const players = await playerColl.find({
        "stats.vpgLastRawPerLeague": { $exists: true }
    }).toArray();
    
    console.log(`Found ${players.length} players with per-league stats.`);
    
    let fixCount = 0;
    for (const p of players) {
        const stats = p.stats;
        const perLeague = stats.vpgLastRawPerLeague || {};
        const leagues = Object.keys(perLeague);
        
        if (leagues.length >= 1) {
            let correctPoints = 0;
            let correctMatches = 0;
            let correctGoals = 0;
            let correctAssists = 0;
            let correctWins = 0;
            let correctLosses = 0;
            let correctTies = 0;
            let correctCleanSheets = 0;
            let correctSaves = 0;
            let correctShots = 0;
            let correctRedCards = 0;
            let correctYellowCards = 0;
            
            leagues.forEach(l => {
                const lStats = perLeague[l];
                correctPoints += lStats.vpgPoints || 0;
                correctMatches += lStats.matchesPlayed || 0;
                correctGoals += lStats.goals || 0;
                correctAssists += lStats.assists || 0;
                correctWins += lStats.wins || 0;
                correctLosses += lStats.losses || 0;
                correctTies += lStats.ties || 0;
                correctCleanSheets += lStats.cleanSheets || 0;
                correctSaves += lStats.saves || 0;
                correctShots += lStats.shots || 0;
                correctRedCards += lStats.redCards || 0;
                correctYellowCards += lStats.yellowCards || 0;
            });
            
            correctPoints = Math.round(correctPoints * 10) / 10;
            const dbPoints = stats.vpgPoints || 0;
            const diff = Math.abs(dbPoints - correctPoints);
            
            if (diff > 1.0) {
                console.log(`\nFixing Player: "${p.eaPlayerName}" (${p._id})`);
                console.log(`  - DB vpgPoints: ${dbPoints} -> Correct: ${correctPoints}`);
                console.log(`  - DB matchesPlayed: ${stats.matchesPlayed} -> Correct: ${correctMatches}`);
                console.log(`  - DB goals: ${stats.goals} -> Correct: ${correctGoals}`);
                console.log(`  - DB assists: ${stats.assists} -> Correct: ${correctAssists}`);
                
                const updatedStats = {
                    ...stats,
                    vpgPoints: correctPoints,
                    matchesPlayed: correctMatches,
                    goals: correctGoals,
                    assists: correctAssists,
                    wins: correctWins,
                    losses: correctLosses,
                    ties: correctTies,
                    cleanSheets: correctCleanSheets,
                    saves: correctSaves,
                    shots: correctShots,
                    redCards: correctRedCards,
                    yellowCards: correctYellowCards
                };
                
                // Perform the update
                await playerColl.updateOne(
                    { _id: p._id },
                    { $set: { stats: updatedStats } }
                );
                fixCount++;
            }
        }
    }
    
    console.log(`\nSuccessfully corrected stats for ${fixCount} mismatching players in the database.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
