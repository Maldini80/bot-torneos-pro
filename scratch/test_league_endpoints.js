const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function checkUrl(name, url) {
    console.log(`Checking ${name}: ${url}`);
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            const items = Array.isArray(data) ? data : (data.data || data.results || []);
            console.log(`Total items: ${items.length}`);
            if (items.length > 0) {
                console.log(`Sample item:`, JSON.stringify(items[0], null, 2));
            }
        } else {
            console.log(`Failed: ${res.status}`);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
    console.log("-----------------------------------------");
}

async function main() {
    const leagueSlug = 'superliga-spain-a';
    await checkUrl("users", `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/users/`);
    await checkUrl("players", `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/players/`);
    await checkUrl("stats", `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/stats/`);
    await checkUrl("contracts", `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/contracts/`);
    await checkUrl("roster", `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/roster/`);
}

main().catch(console.error);
