const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function testKey(key) {
    const url = `https://api.virtualprogaming.com/public/leagues/superliga-spain-a/leaderboard?leaderboard=${key}&limit=5`;
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            const items = data.data || [];
            console.log(`Key "${key}" is valid. Returns ${items.length} items.`);
            if (items.length > 0) {
                console.log(`Sample:`, JSON.stringify(items[0], null, 2));
            }
        } else {
            console.log(`Key "${key}" failed: ${res.status}`);
        }
    } catch (e) {
        console.error(`Key "${key}" error:`, e.message);
    }
    console.log("-----------------------------------------");
}

async function main() {
    await testKey("top_scorers");
    await testKey("top_assists");
    await testKey("top_clean_sheets");
    await testKey("overall");
}

main().catch(console.error);
