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
    console.log("Analyzing VPG leaderboards and matching with database profiles...");
    const client = new MongoClient(process.env.DATABASE_URL);
    
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        // 1. Fetch all leaderboards from VPG to get live points per division
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
        
        console.log(`\nFound ${playerLeagues.size} total players in VPG leaderboards.`);
        
        // Find players with conflicts
        const conflictedUsers = [];
        for (const [lower, leaguesSet] of playerLeagues.entries()) {
            if (leaguesSet.size > 1) {
                conflictedUsers.push(lower);
            }
        }
        
        console.log(`Found ${conflictedUsers.length} players with division conflicts. Auditing each...\n`);
        
        const report = [];
        
        for (const lower of conflictedUsers) {
            const details = playerDetails.get(lower);
            const username = details.username;
            
            // Find player profile in DB
            let dbProfile = await db.collection('player_profiles').findOne({ eaPlayerName: username });
            if (!dbProfile) {
                // Try case-insensitive search
                dbProfile = await db.collection('player_profiles').findOne({
                    eaPlayerName: { $regex: new RegExp('^' + username.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
                });
            }
            
            if (!dbProfile) {
                // Player not in fantasy database (not owned/free agent or not synced in profiles)
                continue;
            }
            
            // Determine active contract division from DB profile
            const activeLeagueSlug = dbProfile.vpgLeagueSlug;
            const currentDbPoints = dbProfile.stats?.vpgPoints || 0;
            
            let activePoints = 0;
            let activePJ = 0;
            let inactivePoints = 0;
            let inactivePJ = 0;
            let activeInfo = null;
            let inactiveInfos = [];
            
            for (const [league, info] of details.teams.entries()) {
                if (league === activeLeagueSlug) {
                    activePoints = info.points;
                    activePJ = info.matchesPlayed;
                    activeInfo = info;
                } else {
                    inactivePoints += info.points;
                    inactivePJ += info.matchesPlayed;
                    inactiveInfos.push({ league, ...info });
                }
            }
            
            const expectedSum = activePoints + inactivePoints;
            const difference = expectedSum - currentDbPoints;
            
            // We are interested in cases where there are positive inactive points and they are not included in the DB points
            if (inactivePoints > 0 && Math.abs(difference) > 1) {
                report.push({
                    username: dbProfile.eaPlayerName,
                    currentDbPoints,
                    activeLeagueSlug,
                    activePoints,
                    activePJ,
                    inactivePoints,
                    inactivePJ,
                    expectedSum,
                    inactiveInfos,
                    dbProfileId: dbProfile._id
                });
            }
        }
        
        console.log(`=== AUDIT REPORT: PLAYERS NEEDING POINTS CORRECTION ===`);
        console.log(`Found ${report.length} players with division conflicts who have lost their inactive division points in DB:\n`);
        
        report.forEach((item, index) => {
            console.log(`${index + 1}. Player: "${item.username}"`);
            console.log(`   - Current DB Points: ${item.currentDbPoints} (matches active: ${item.activePoints} pts in ${item.activeLeagueSlug})`);
            console.log(`   - Lost Points (Inactive Division): ${item.inactivePoints} pts in:`);
            item.inactiveInfos.forEach(inInfo => {
                console.log(`     * League: "${inInfo.league}" | Club: "${inInfo.teamName}" | PJ: ${inInfo.matchesPlayed} | Pts: ${inInfo.points}`);
            });
            console.log(`   - Expected Corrected Total: ${item.expectedSum} pts`);
            console.log(`----------------------------------------`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
