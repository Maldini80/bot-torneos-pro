import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARD_POSITIONS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
const LEAGUES = ['superliga-spain-a', 'superliga-spain-b'];
const TARGETS = ['xrubenprieto-_-', 'xdoku_11', 'xrubenprieto'];

async function run() {
    console.log('=== BUSCANDO A RUBEN PRIETO / DOKU EN VPG ===\n');
    
    for (const league of LEAGUES) {
        console.log(`--- Buscando en la liga VPG: ${league} ---`);
        for (const pos of LEADERBOARD_POSITIONS) {
            let offset = 0;
            let hasMore = true;
            
            while (hasMore) {
                const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${pos}&type=all&limit=30&offset=${offset}`;
                try {
                    const res = await fetch(url, { headers: HEADERS });
                    if (!res.ok) {
                        break;
                    }
                    const data = await res.json();
                    const players = data.data || [];
                    
                    if (players.length === 0) {
                        hasMore = false;
                        break;
                    }
                    
                    for (const p of players) {
                        const nameLower = p.username?.toLowerCase();
                        if (nameLower && TARGETS.some(t => nameLower === t || nameLower.includes('doku') || nameLower.includes('rubenprieto'))) {
                            console.log(`🎉 ¡ENCONTRADO en la liga "${league}", clasificación "${pos}"!`);
                            console.log(JSON.stringify(p, null, 2));
                        }
                    }
                    
                    if (players.length < 30) {
                        hasMore = false;
                    } else {
                        offset += 30;
                    }
                } catch (e) {
                    console.error(`Error:`, e.message);
                    break;
                }
            }
        }
    }
}
run();
