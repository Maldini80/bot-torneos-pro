// scratch/run_sync_doku_real.js
import { connectDb, getDb } from '../database.js';
import fetch from 'node-fetch';
import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

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
    const testDb = getDb('test');
    
    const dbTeams = await testDb.collection('teams').find({ vpgLeagueSlug: { $in: ['superliga-spain-a', 'superliga-spain-b'] } }).toArray();

    // Reset player in DB to a clean state for testing (copy of what is currently there)
    const originalPlayer = await db.collection('player_profiles').findOne({ eaPlayerName: "xDoku_11" });
    console.log("Original player in DB:", JSON.stringify(originalPlayer, null, 2));

    // Crawled stats from A and B
    const crawled_A = {
        matchesPlayed: 10,
        vpgPoints: 111.2,
        goals: 3,
        assists: 1,
        team_slug: 'ltk-esports',
        team_name: 'LTK ESPORTS'
    };

    const crawled_B = {
        matchesPlayed: 4,
        vpgPoints: 46.3,
        goals: 1,
        assists: 0,
        team_slug: 'ceuta-guardians',
        team_name: 'CEUTA GUARDIANS'
    };

    console.log("\n--- Processing Sweep A for xDoku_11 ---");
    let existingPlayer = originalPlayer;
    let updateData = {
        lastClub: crawled_A.team_name,
        lastActive: new Date(),
        lastPosition: 'CARR',
        vpgLeagueSlug: 'superliga-spain-a',
        vpgTeamSlug: crawled_A.team_slug,
        stats: {
            matchesPlayed: crawled_A.matchesPlayed,
            goals: crawled_A.goals,
            assists: crawled_A.assists,
            vpgPoints: crawled_A.vpgPoints
        }
    };

    let shouldSkip = false;
    if (existingPlayer.vpgLeagueSlug && existingPlayer.vpgLeagueSlug !== 'superliga-spain-a') {
        const username = 'xDoku_11';
        const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
        const contractRes = await fetch(contractsUrl, { headers: HEADERS });
        if (contractRes.ok) {
            const contracts = await contractRes.json();
            const activeContracts = contracts.filter(c => c.status === 'active');
            if (activeContracts.length > 0) {
                const matchesActiveContract = activeContracts.some(c => 
                    String(c.team_slug || '').toLowerCase().trim() === String(updateData.vpgTeamSlug || '').toLowerCase().trim()
                );
                if (!matchesActiveContract) {
                    let contractTeam = null;
                    for (const contract of activeContracts) {
                        const cSlug = String(contract.team_slug || '').toLowerCase().trim();
                        const cName = String(contract.team_name || '').toLowerCase().trim();
                        const found = dbTeams.find(t => 
                            String(t.vpgTeamSlug || '').toLowerCase().trim() === cSlug ||
                            String(t.name || '').toLowerCase().trim() === cName
                        );
                        if (found) {
                            contractTeam = found;
                            break;
                        }
                    }
                    if (contractTeam) {
                        console.log(`[Conflict resolution] Re-mapping to ${contractTeam.name}`);
                        updateData.lastClub = contractTeam.name;
                        updateData.vpgLeagueSlug = contractTeam.vpgLeagueSlug;
                        updateData.vpgTeamSlug = contractTeam.vpgTeamSlug;
                    } else {
                        shouldSkip = true;
                    }
                }
            }
        }
    }

    if (!shouldSkip) {
        const crawledStats = JSON.parse(JSON.stringify(updateData.stats || {}));
        updateData.stats = computeUpdatedStats(existingPlayer, crawledStats, updateData.vpgTeamSlug, 'superliga-spain-a');
        console.log("Updated updateData stats for Sweep A:", JSON.stringify(updateData, null, 2));
        existingPlayer = { ...existingPlayer, ...updateData };
    } else {
        console.log("Sweep A was skipped.");
    }

    console.log("\n--- Processing Sweep B for xDoku_11 ---");
    updateData = {
        lastClub: crawled_B.team_name,
        lastActive: new Date(),
        lastPosition: 'CARR',
        vpgLeagueSlug: 'superliga-spain-b',
        vpgTeamSlug: crawled_B.team_slug,
        stats: {
            matchesPlayed: crawled_B.matchesPlayed,
            goals: crawled_B.goals,
            assists: crawled_B.assists,
            vpgPoints: crawled_B.vpgPoints
        }
    };

    shouldSkip = false;
    if (existingPlayer.vpgLeagueSlug && existingPlayer.vpgLeagueSlug !== 'superliga-spain-b') {
        // ... conflict logic ...
        console.log("Conflict logic would run for Sweep B.");
    }

    if (!shouldSkip) {
        const crawledStats = JSON.parse(JSON.stringify(updateData.stats || {}));
        updateData.stats = computeUpdatedStats(existingPlayer, crawledStats, updateData.vpgTeamSlug, 'superliga-spain-b');
        console.log("Updated updateData stats for Sweep B:", JSON.stringify(updateData, null, 2));
    } else {
        console.log("Sweep B was skipped.");
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
