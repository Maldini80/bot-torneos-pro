const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const POSITIONAL_KEYS = [
    'top_gk',
    'top_cb',
    'top_fb',
    'top_cdm',
    'top_cam',
    'top_wingers',
    'top_strikers'
];

async function fetchLeaderboard(league, key) {
    let players = [];
    let offset = 0;
    while (true) {
        const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${key}&limit=30&offset=${offset}`;
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const json = await res.json();
                const items = json.data || [];
                if (items.length === 0) break;
                players.push(...items);
                if (items.length < 30) break;
            } else {
                break;
            }
        } catch (e) {
            break;
        }
        offset += 30;
    }
    return players;
}

async function checkLeague(leagueSlug) {
    console.log(`\nChecking league: ${leagueSlug}`);
    const highestRated = await fetchLeaderboard(leagueSlug, 'highest_rated');
    console.log(`- Highest Rated total players: ${highestRated.length}`);
    
    const positionalPlayers = new Map();
    for (const key of POSITIONAL_KEYS) {
        const list = await fetchLeaderboard(leagueSlug, key);
        for (const p of list) {
            positionalPlayers.set(p.username.toLowerCase(), p);
        }
    }
    console.log(`- Positional leaderboards unique players: ${positionalPlayers.size}`);
    
    let missingCount = 0;
    for (const p of highestRated) {
        if (!positionalPlayers.has(p.username.toLowerCase())) {
            missingCount++;
        }
    }
    console.log(`- Players from Highest Rated missing in Positionals: ${missingCount}`);
}

async function main() {
    await checkLeague('superliga-spain-a');
    await checkLeague('superliga-spain-b');
    await checkLeague('segunda-division-b-spain');
}

main().catch(console.error);
