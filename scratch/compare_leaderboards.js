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

async function fetchLeaderboard(league, key, maxPages = 5) {
    let players = [];
    let offset = 0;
    for (let page = 0; page < maxPages; page++) {
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

async function main() {
    const leagueSlug = 'superliga-spain-a';
    
    console.log("Fetching highest_rated players...");
    const highestRated = await fetchLeaderboard(leagueSlug, 'highest_rated', 10);
    console.log(`Fetched ${highestRated.length} players from highest_rated.`);
    
    console.log("Fetching positional players...");
    const positionalPlayers = new Map();
    for (const key of POSITIONAL_KEYS) {
        const list = await fetchLeaderboard(leagueSlug, key, 10);
        console.log(`- ${key}: ${list.length} players`);
        for (const p of list) {
            positionalPlayers.set(p.username.toLowerCase(), { key, player: p });
        }
    }
    console.log(`Fetched ${positionalPlayers.size} unique players from all positional leaderboards.`);
    
    // Check if any player in highest_rated is missing from positional
    let missingCount = 0;
    for (const p of highestRated) {
        const usernameLower = p.username.toLowerCase();
        if (!positionalPlayers.has(usernameLower)) {
            missingCount++;
            if (missingCount <= 10) {
                console.log(`Missing from positional: ${p.username} (${p.team_name}, rating: ${p.match_rating}, matches: ${p.matches_played})`);
            }
        }
    }
    console.log(`Total players in highest_rated missing from positional: ${missingCount} / ${highestRated.length}`);
}

main().catch(console.error);
