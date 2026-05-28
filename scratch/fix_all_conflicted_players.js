import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const LEAGUES = [
    'superliga-spain-a',
    'superliga-spain-b',
    'segunda-division-a-spain',
    'segunda-division-b-spain',
    'tercera-division-a-spain',
    'tercera-division-b-spain',
    'cuarta-division-a-spain',
    'cuarta-division-b-spain',
    'quinta-division-a-spain',
    'quinta-division-b-spain',
    'quinta-division-c',
    'quinta-division-d'
];

const LEADERBOARDS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const isExecute = process.argv.includes('--execute');
    console.log(`========================================`);
    console.log(`MIGRATION SCRIPT FOR DIVISION CONFLICTS`);
    console.log(`MODE: ${isExecute ? 'LIVE EXECUTION' : 'DRY-RUN (SIMULATION)'}`);
    console.log(`========================================\n`);

    const client = new MongoClient(process.env.DATABASE_URL);
    
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        // 1. Fetch leaderboards from VPG to get live points per division
        const playerLeagues = new Map();
        const playerDetails = new Map();
        
        for (const league of LEAGUES) {
            console.log(`Scanning VPG API for ${league}...`);
            for (const lb of LEADERBOARDS) {
                let offset = 0;
                let hasMore = true;
                while (hasMore) {
                    const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${lb}&type=all&limit=30&offset=${offset}`;
                    try {
                        const res = await fetch(url, { headers: HEADERS });
                        if (res.ok) {
                            const data = await res.json();
                            const players = data.data || [];
                            if (players.length === 0) {
                                hasMore = false;
                            } else {
                                for (const p of players) {
                                    const username = p.username;
                                    if (!username) continue;
                                    const lower = username.toLowerCase();
                                    
                                    if (!playerLeagues.has(lower)) {
                                        playerLeagues.set(lower, new Set());
                                        playerDetails.set(lower, {
                                            username,
                                            teams: new Map()
                                        });
                                    }
                                    
                                    playerLeagues.get(lower).add(league);
                                    playerDetails.get(lower).teams.set(league, {
                                        teamName: p.team_name,
                                        teamSlug: p.team_slug,
                                        matchesPlayed: p.matches_played,
                                        points: p.points,
                                        pos: lb
                                    });
                                }
                                if (players.length < 30) {
                                    hasMore = false;
                                } else {
                                    offset += 30;
                                }
                            }
                        } else {
                            hasMore = false;
                        }
                    } catch (e) {
                        hasMore = false;
                    }
                }
            }
        }
        
        // Find players with conflicts
        const conflictedUsers = [];
        for (const [lower, leaguesSet] of playerLeagues.entries()) {
            if (leaguesSet.size > 1) {
                conflictedUsers.push(lower);
            }
        }
        
        console.log(`\nFound ${conflictedUsers.length} players with division conflicts. Cross-referencing database...`);
        
        let processedCount = 0;
        let updateCount = 0;
        
        for (const lower of conflictedUsers) {
            const details = playerDetails.get(lower);
            const username = details.username;
            
            // Find player profile in DB
            let dbProfile = await db.collection('player_profiles').findOne({ eaPlayerName: username });
            if (!dbProfile) {
                dbProfile = await db.collection('player_profiles').findOne({
                    eaPlayerName: { $regex: new RegExp('^' + username.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
                });
            }
            
            if (!dbProfile) continue;
            
            processedCount++;
            
            const activeLeagueSlug = dbProfile.vpgLeagueSlug;
            const currentDbPoints = dbProfile.stats?.vpgPoints || 0;
            const currentDbPJ = dbProfile.stats?.matchesPlayed || 0;
            
            let activePoints = 0;
            let activePJ = 0;
            let inactivePoints = 0;
            let inactivePJ = 0;
            let inactiveInfos = [];
            
            for (const [league, info] of details.teams.entries()) {
                if (league === activeLeagueSlug) {
                    activePoints = info.points;
                    activePJ = info.matchesPlayed;
                } else {
                    inactivePoints += info.points;
                    inactivePJ += info.matchesPlayed;
                    inactiveInfos.push({ league, ...info });
                }
            }
            
            const expectedPointsSum = activePoints + inactivePoints;
            const expectedPJSum = activePJ + inactivePJ;
            const difference = expectedPointsSum - currentDbPoints;
            
            // Only update if there are inactive points not accounted for
            if (inactivePoints > 0 && Math.abs(difference) > 1) {
                updateCount++;
                console.log(`\n[${updateCount}] Player: "${dbProfile.eaPlayerName}"`);
                console.log(`    Active Club/League: "${dbProfile.lastClub || 'N/A'}" in ${activeLeagueSlug}`);
                console.log(`    Points stats: Active VPG points: ${activePoints} | Inactive VPG points: ${inactivePoints}`);
                console.log(`    Stats Change in Profile:`);
                console.log(`      * vpgPoints: ${currentDbPoints} -> ${expectedPointsSum}`);
                console.log(`      * matchesPlayed: ${currentDbPJ} -> ${expectedPJSum}`);
                
                // Fetch zero-mode leagues where this player has basePoints defined
                const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
                const basePointsUpdates = [];
                
                for (const l of leagues) {
                    const basePointsMap = l.basePoints || {};
                    // Find key case-insensitive
                    const matchKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === dbProfile.eaPlayerName.toLowerCase());
                    if (matchKey) {
                        const currentBaseVal = basePointsMap[matchKey];
                        
                        // Check if currentBaseVal is closer to new active division points (within 3 pts)
                        // If so, the league was started *after* the division transfer. So their points in this league must remain 0.
                        // We do this by setting basePoints to expectedPointsSum.
                        // Otherwise, the league was started *before* the division transfer. We keep basePoints as is (which is around activePoints or 0),
                        // so they get points = expectedPointsSum - basePoints = new points.
                        const diffToActive = Math.abs(currentBaseVal - activePoints);
                        const diffToInactive = Math.abs(currentBaseVal - inactivePoints);
                        
                        let newBaseVal = currentBaseVal;
                        let action = 'KEEP AS IS';
                        
                        // If basePoints is close to activePoints (or close to 0 if activePoints is 0)
                        if (diffToActive <= 3) {
                            newBaseVal = expectedPointsSum;
                            action = `UPDATE to ${expectedPointsSum} (League started AFTER transfer)`;
                            basePointsUpdates.push({ leagueId: l._id, leagueName: l.name, key: matchKey, val: newBaseVal });
                        } else {
                            action = `KEEP ${currentBaseVal} (League started BEFORE transfer, player will gain ${expectedPointsSum - currentBaseVal} net pts)`;
                        }
                        
                        console.log(`    League "${l.name}" basePoints [${matchKey}]: Current: ${currentBaseVal} | Decision: ${action}`);
                    }
                }
                
                if (isExecute) {
                    // Update player profile
                    await db.collection('player_profiles').updateOne(
                        { _id: dbProfile._id },
                        { 
                            $set: { 
                                "stats.vpgPoints": expectedPointsSum,
                                "stats.matchesPlayed": expectedPJSum
                            } 
                        }
                    );
                    
                    // Update zero leagues basePoints where required
                    for (const bpUp of basePointsUpdates) {
                        await db.collection('fantasy_leagues').updateOne(
                            { _id: bpUp.leagueId },
                            { $set: { [`basePoints.${bpUp.key}`]: bpUp.val } }
                        );
                    }
                    console.log(`    ✅ DB updated successfully.`);
                }
            }
        }
        
        console.log(`\n========================================`);
        console.log(`MIGRATION SUMMARY`);
        console.log(`Total conflicted players checked: ${processedCount}`);
        console.log(`Players requiring points consolidation: ${updateCount}`);
        console.log(`Status: ${isExecute ? 'Successfully executed and saved to DB!' : 'Dry-run finished. No data was modified.'}`);
        console.log(`========================================`);
        
    } catch (e) {
        console.error("Migration Error:", e);
    } finally {
        await client.close();
    }
}

run();
