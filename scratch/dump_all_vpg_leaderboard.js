import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import fs from 'fs';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARDS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];

async function run() {
    const leagueSlug = "superliga-spain-a";
    console.log(`=== DUMPING ALL PLAYERS FROM LEADERBOARDS IN ${leagueSlug} ===`);
    
    let allPlayers = [];
    
    for (const lb of LEADERBOARDS) {
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
            const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${lb}&type=all&limit=50&offset=${offset}`;
            try {
                const res = await fetch(url, { headers: HEADERS });
                if (res.ok) {
                    const data = await res.json();
                    const players = data.data || [];
                    if (players.length === 0) {
                        hasMore = false;
                        break;
                    }
                    
                    players.forEach(p => {
                        allPlayers.push({
                            username: p.username,
                            team_name: p.team_name,
                            team_slug: p.team_slug,
                            position: p.position_name,
                            leaderboard: lb,
                            matches: p.matches_played,
                            points: p.points
                        });
                    });
                    
                    if (players.length < 50) {
                        hasMore = false;
                    }
                } else {
                    hasMore = false;
                }
            } catch (e) {
                console.error(e);
                hasMore = false;
            }
            offset += 50;
            if (offset >= 1000) hasMore = false;
        }
    }
    
    // Sort players alphabetically by username
    allPlayers.sort((a, b) => String(a.username).localeCompare(String(b.username)));
    
    const output = allPlayers.map(p => 
        `User: "${p.username}" | Team: "${p.team_name}" (${p.team_slug}) | Pos: ${p.position} | LB: ${p.leaderboard} | PJ: ${p.matches} | Pts: ${p.points}`
    ).join('\n');
    
    fs.writeFileSync('scratch/all_vpg_players_dump.txt', output, 'utf-8');
    console.log(`Saved ${allPlayers.length} players to scratch/all_vpg_players_dump.txt`);
}
run();
