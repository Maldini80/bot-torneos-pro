import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function checkLeaderboards() {
    const leagueSlug = 'superliga-spain-b';
    const leaderboards = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
    
    console.log(`Checking VPG API for MONKEYDFFYLU in league ${leagueSlug}...`);
    
    for (const lb of leaderboards) {
        let offset = 0;
        let found = false;
        
        while (offset < 300) {
            const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${lb}&type=all&limit=50&offset=${offset}`;
            try {
                const res = await fetch(url, { headers: HEADERS });
                if (!res.ok) {
                    console.log(`Failed to fetch ${lb} at offset ${offset}: ${res.status}`);
                    break;
                }
                const json = await res.json();
                const players = json.data || json.results || (Array.isArray(json) ? json : []);
                
                if (players.length === 0) break;
                
                const match = players.find(p => String(p.username || '').toLowerCase() === 'monkeydffylu');
                if (match) {
                    console.log(`✅ Found MONKEYDFFYLU in ${lb} leaderboard!`);
                    console.log(JSON.stringify(match, null, 2));
                    found = true;
                    break;
                }
                
                offset += 50;
            } catch (err) {
                console.error(`Error:`, err.message);
                break;
            }
        }
        
        if (found) return;
    }
    
    console.log('❌ MONKEYDFFYLU was not found in any Superliga B leaderboards on the VPG API.');
}

checkLeaderboards();
