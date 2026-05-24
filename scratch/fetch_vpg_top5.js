const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function testFetch() {
    const leagueSlug = "superliga-spain-b";
    const vpgPosKey = "top_strikers";
    const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&limit=5&offset=0`;
    
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return;
    const data = await res.json();
    console.log("Top 5 players:", JSON.stringify(data.data, null, 2));
}

testFetch().catch(console.error);
