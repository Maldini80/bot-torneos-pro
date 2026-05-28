// scratch/find_duplicate_points_players.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Find all history records from today (May 28, 2026)
    const today = new Date('2026-05-28T00:00:00.000Z');
    const history = await db.collection('fantasy_player_history').find({
        createdAt: { $gte: today }
    }).toArray();

    // Group by player name and check if they got points from the second sync cluster (around 13:29)
    const playersMap = {};
    for (const h of history) {
        const key = h.playerName.toLowerCase();
        if (!playersMap[key]) {
            playersMap[key] = [];
        }
        playersMap[key].push(h);
    }

    console.log('[DUPLICATE DETECTOR] Analyzing player history entries...');
    let totalIssues = 0;
    const playersToFix = [];

    for (const [name, list] of Object.entries(playersMap)) {
        // Find if they have the specific duplicate points entry
        const sync1 = list.filter(h => h.createdAt.toISOString().includes('T10:') || h.createdAt.toISOString().includes('T11:'));
        const sync2 = list.filter(h => h.createdAt.toISOString().includes('T13:'));

        if (sync2.length > 0) {
            // Check if they got a huge delta in sync2
            const sync2MaxPoints = Math.max(...sync2.map(h => h.points));
            if (sync2MaxPoints > 50) { // Large delta points indicating full baseline import
                totalIssues++;
                console.log(`- Player: "${name}" | Sync1 count: ${sync1.length} | Sync2 points: ${sync2.map(h => h.points)} | LeagueIDs: ${sync2.map(h => h.leagueId)}`);
                playersToFix.push({
                    name,
                    historyDocs: sync2
                });
            }
        }
    }

    console.log(`[DUPLICATE DETECTOR] Found ${totalIssues} players affected by the duplicate baseline bug.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
