const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const leagueSlug = 'superliga-spain-a';
    let offset = 0;
    let foundStats = 0;
    let totalPlayers = 0;
    
    for (let page = 0; page < 5; page++) {
        const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=highest_rated&limit=30&offset=${offset}`;
        console.log(`Fetching page ${page} (offset ${offset}):`, url);
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const data = await res.json();
                const items = data.data || [];
                if (items.length === 0) break;
                totalPlayers += items.length;
                for (const item of items) {
                    // Check if any stat is not null
                    const hasStats = item.goals !== null || item.assists !== null || item.saves !== null || item.clean_sheet !== null;
                    if (hasStats) {
                        foundStats++;
                        console.log(`Found player with stats:`, item.username, "goals:", item.goals, "assists:", item.assists);
                    }
                }
            } else {
                console.log(`Failed: ${res.status}`);
                break;
            }
        } catch (e) {
            console.error("Error:", e.message);
            break;
        }
        offset += 30;
    }
    console.log(`\nProcessed ${totalPlayers} players. Found ${foundStats} with stats.`);
}

test();
