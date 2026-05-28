import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const vpgPosKey = 'top_cb';
    const leagueSlug = 'superliga-spain-a';
    
    let offset = 0;
    let hasMore = true;
    
    console.log("Fetching top_cb leaderboard...");
    while (hasMore) {
        const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&type=all&limit=30&offset=${offset}`;
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            const players = data.data || [];
            
            const rayden = players.find(p => p.username && p.username.toLowerCase() === 'zzraydenzz');
            if (rayden) {
                console.log("FOUND RAYDEN!");
                console.log(JSON.stringify(rayden, null, 2));
                break;
            }
            
            if (players.length < 30) hasMore = false;
        } else {
            console.error("HTTP error:", res.status);
            break;
        }
        offset += 30;
        if (offset >= 1200) break;
    }
}

test().catch(console.error);
