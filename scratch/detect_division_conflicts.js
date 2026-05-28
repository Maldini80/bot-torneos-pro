import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

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

async function run() {
    console.log("Starting scan of all VPG Spain divisions for players in multiple divisions...");
    
    // Map of username.toLowerCase() -> Set of league slugs
    const playerLeagues = new Map();
    // Map of username.toLowerCase() -> Original username string and team details
    const playerDetails = new Map();

    for (const league of LEAGUES) {
        console.log(`Scanning league: ${league}...`);
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
                    console.error(`Error fetching ${league} / ${lb}: ${e.message}`);
                    hasMore = false;
                }
            }
        }
    }

    console.log("\n=== DETECTION RESULTS ===");
    let conflictCount = 0;
    
    for (const [lower, leaguesSet] of playerLeagues.entries()) {
        if (leaguesSet.size > 1) {
            conflictCount++;
            const details = playerDetails.get(lower);
            console.log(`\nConflict #${conflictCount}: Player "${details.username}" is active in ${leaguesSet.size} divisions:`);
            for (const league of leaguesSet) {
                const info = details.teams.get(league);
                console.log(`  - League: "${league}" | Club: "${info.teamName}" (${info.teamSlug}) | Pos: ${info.pos} | PJ: ${info.matchesPlayed} | Pts VPG: ${info.points}`);
            }
        }
    }
    
    console.log(`\nScan finished. Found ${conflictCount} players with division conflicts.`);
}

run();
