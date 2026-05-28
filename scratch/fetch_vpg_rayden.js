const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Content-Type": "application/json"
};

async function checkLeaderboard(leagueSlug) {
    const vpgPosKeys = ["top_gk", "top_cb", "top_wingers", "top_midfielders", "top_attackers"];
    console.log(`Checking league: ${leagueSlug}`);
    for (const pos of vpgPosKeys) {
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
            const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${pos}&type=all&limit=30&offset=${offset}`;
            const res = await fetch(url, { headers: HEADERS });
            if (!res.ok) {
                console.error(`Error fetching ${url}: ${res.status}`);
                break;
            }
            const json = await res.json();
            const players = json.data || [];
            if (players.length < 30) {
                hasMore = false;
            }
            const found = players.find(p => p.username && p.username.toLowerCase() === 'zzraydenzz');
            if (found) {
                console.log(`FOUND in ${leagueSlug} (${pos}):`, JSON.stringify(found, null, 2));
                return;
            }
            offset += 30;
            if (offset > 600) break; // limit check
        }
    }
    console.log(`Not found in ${leagueSlug}`);
}

async function run() {
    await checkLeaderboard('superliga-spain-a');
    await checkLeaderboard('superliga-spain-b');
}

run().catch(console.error);
