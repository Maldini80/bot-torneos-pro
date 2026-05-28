import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const leagueSlug = "superliga-spain-a";
    const searchStr = "rayden";
    
    console.log(`=== SEARCHING LEADERBOARD ROWS CONTAINING '${searchStr}' ===`);
    
    const lbs = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
    
    for (const lb of lbs) {
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
                    
                    const matching = players.filter(p => p.username && p.username.toLowerCase().includes(searchStr.toLowerCase()));
                    if (matching.length > 0) {
                        matching.forEach(p => {
                            console.log(`Found in [${lb}]:`, JSON.stringify(p, null, 2));
                        });
                    }
                    
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
    console.log("Search completed.");
}
run();
