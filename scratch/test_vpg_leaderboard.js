const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const leagueSlug = 'superliga-spain-a';
    const vpgPosKey = 'top_strikers';
    const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&limit=5&offset=0`;
    
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            const players = data.data || [];
            console.log("Sample players:", JSON.stringify(players.slice(0, 2), null, 2));
        } else {
            console.error("VPG response not ok:", res.status, res.statusText);
        }
    } catch (e) {
        console.error("Error fetching leaderboard:", e.message);
    }
}

test();
