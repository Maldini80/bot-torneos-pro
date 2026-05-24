const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function testFetch() {
    const leagueSlug = "superliga-spain-b";
    const vpgPosKey = "top_strikers";
    const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&limit=100&offset=0`;
    
    console.log(`Fetching from: ${url}`);
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
        console.error("HTTP Error:", res.status);
        return;
    }
    const data = await res.json();
    const players = data.data || [];
    console.log(`Fetched ${players.length} players.`);
    
    const target = players.find(p => p.username && p.username.toLowerCase().includes("kilianeltete19"));
    if (target) {
        console.log("Found kilianeltete19:", JSON.stringify(target, null, 2));
    } else {
        console.log("kilianeltete19 not found in top 100 strikers.");
        // print first 5 players
        console.log("First 5 players:", JSON.stringify(players.slice(0, 5), null, 2));
    }
}

testFetch().catch(console.error);
