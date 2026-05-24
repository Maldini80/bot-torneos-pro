const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const leagueSlug = 'superliga-spain-a';
    const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=top_strikers&limit=30`;
    console.log(`Fetching top_strikers:`, url);
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log("Status:", res.status);
        if (res.ok) {
            const data = await res.json();
            const items = data.data || data;
            console.log("Total items returned:", items.length);
            if (items.length > 0) {
                console.log("Sample item:", JSON.stringify(items[0], null, 2));
            }
        } else {
            console.log("Failed:", await res.text());
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
