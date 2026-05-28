// scratch/test_sync_sequence.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

// Import the computeUpdatedStats logic directly
function computeUpdatedStats(existingPlayer, crawledStats, crawledTeamSlug, crawledLeagueSlug) {
    const pSlugNormalized = String(crawledTeamSlug || '').toLowerCase().trim();
    const dbSlugNormalized = String(existingPlayer.vpgTeamSlug || '').toLowerCase().trim();

    const perLeagueRaw = existingPlayer.stats?.vpgLastRawPerLeague || {};
    let lastRaw;

    if (crawledLeagueSlug && perLeagueRaw[crawledLeagueSlug]) {
        lastRaw = perLeagueRaw[crawledLeagueSlug];
    } else if (crawledLeagueSlug && Object.keys(perLeagueRaw).length > 0) {
        lastRaw = {};
    } else {
        const hasTransferred = dbSlugNormalized && pSlugNormalized && dbSlugNormalized !== pSlugNormalized;
        lastRaw = hasTransferred ? {} : (existingPlayer.stats?.vpgLastRaw || existingPlayer.stats || {});
    }

    const deltaPoints = Math.max(0, Math.round(((parseFloat(crawledStats.vpgPoints) || 0) - (parseFloat(lastRaw.vpgPoints) || 0)) * 10) / 10);
    const deltaMatches = Math.max(0, (parseInt(crawledStats.matchesPlayed) || 0) - (parseInt(lastRaw.matchesPlayed) || 0));
    const deltaGoals = Math.max(0, (parseInt(crawledStats.goals) || 0) - (parseInt(lastRaw.goals) || 0));
    const deltaAssists = Math.max(0, (parseInt(crawledStats.assists) || 0) - (parseInt(lastRaw.assists) || 0));

    const avgRating = 6.0;

    const newRawEntry = {
        matchesPlayed: parseInt(crawledStats.matchesPlayed) || 0,
        goals: parseInt(crawledStats.goals) || 0,
        assists: parseInt(crawledStats.assists) || 0,
        vpgPoints: parseFloat(crawledStats.vpgPoints) || 0
    };

    const updatedPerLeagueRaw = { ...perLeagueRaw };
    if (crawledLeagueSlug) {
        updatedPerLeagueRaw[crawledLeagueSlug] = newRawEntry;
    }

    return {
        matchesPlayed: (existingPlayer.stats?.matchesPlayed || 0) + deltaMatches,
        goals: (existingPlayer.stats?.goals || 0) + deltaGoals,
        assists: (existingPlayer.stats?.assists || 0) + deltaAssists,
        vpgPoints: Math.round(((existingPlayer.stats?.vpgPoints || 0) + deltaPoints) * 10) / 10,
        vpgLastRaw: newRawEntry,
        vpgLastRawPerLeague: updatedPerLeagueRaw
    };
}

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Initial State (representing what is in the DB currently)
    let player = await db.collection('player_profiles').findOne({ eaPlayerName: "xDoku_11" });
    console.log("--- INITIAL DB STATE ---");
    console.log(JSON.stringify({
        vpgPoints: player.stats?.vpgPoints,
        matchesPlayed: player.stats?.matchesPlayed,
        vpgLastRaw: player.stats?.vpgLastRaw,
        vpgLastRawPerLeague: player.stats?.vpgLastRawPerLeague
    }, null, 2));

    // Crawled stats from A
    const crawled_A = {
        matchesPlayed: 10,
        vpgPoints: 111.2,
        goals: 3,
        assists: 1
    };

    // Crawled stats from B
    const crawled_B = {
        matchesPlayed: 4,
        vpgPoints: 46.3,
        goals: 1,
        assists: 0
    };

    // 2. Simulate Sweep of League A
    console.log("\n--- SIMULATING SWEEP A ---");
    console.log("Crawled A stats:", crawled_A);
    let updatedStats_A = computeUpdatedStats(player, crawled_A, 'ltk-esports', 'superliga-spain-a');
    console.log("Stats after Sweep A:", JSON.stringify(updatedStats_A, null, 2));

    // Update player object with Sweep A result (re-mapped fields)
    let playerAfterA = {
        ...player,
        vpgLeagueSlug: 'superliga-spain-b', // contract re-map
        vpgTeamSlug: 'ceuta-guardians',     // contract re-map
        stats: updatedStats_A
    };

    // 3. Simulate Sweep of League B
    console.log("\n--- SIMULATING SWEEP B ---");
    console.log("Crawled B stats:", crawled_B);
    let updatedStats_B = computeUpdatedStats(playerAfterA, crawled_B, 'ceuta-guardians', 'superliga-spain-b');
    console.log("Stats after Sweep B:", JSON.stringify(updatedStats_B, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
