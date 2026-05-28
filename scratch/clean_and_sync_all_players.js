import dns from 'dns';
dns.setServers(['8.8.8.8']); // Use Google DNS for resolving Mongo SRV

import { connectDb, getDb } from '../database.js';
import { syncFantasyWithVpg } from '../src/utils/fantasyVpgSync.js';

async function main() {
    console.log("Connecting to database...");
    await connectDb();
    const db = getDb();
    const playerColl = db.collection('player_profiles');

    const defaultStats = {
        matchesPlayed: 0,
        goals: 0,
        assists: 0,
        passesMade: 0,
        passesAttempted: 0,
        tacklesMade: 0,
        tacklesAttempted: 0,
        shots: 0,
        shotsOnTarget: 0,
        interceptions: 0,
        saves: 0,
        redCards: 0,
        yellowCards: 0,
        mom: 0,
        cleanSheets: 0,
        goalsConceded: 0,
        ratings: [],
        wins: 0,
        losses: 0,
        ties: 0,
        vpgPoints: 0
    };

    console.log("Resetting VPG player stats in database to clean states...");
    const resetResult = await playerColl.updateMany(
        { vpgLeagueSlug: { $exists: true, $ne: null } },
        { $set: { stats: defaultStats } }
    );
    console.log(`Successfully reset stats for ${resetResult.modifiedCount} VPG players.`);

    console.log("Starting Fantasy VPG sync to fetch official leaderboard stats...");
    await syncFantasyWithVpg();
    
    console.log("\nVerifying Nestor's profile in database after sync...");
    const nestor = await playerColl.findOne({ eaPlayerName: "nestor007" });
    console.log("Nestor Profile:", JSON.stringify(nestor, null, 2));

    console.log("\nCleanup and sync finished successfully!");
    process.exit(0);
}

main().catch(err => {
    console.error("Task failed:", err);
    process.exit(1);
});
