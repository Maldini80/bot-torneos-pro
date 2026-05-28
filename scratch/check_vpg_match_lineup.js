const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const matchId = '1580165';
    const url = `https://api.virtualprogaming.com/public/matches/${matchId}/`;
    
    console.log(`=== Fetching VPG Match Detail: ${matchId} ===`);
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            console.log('Match Details:', JSON.stringify(data, null, 2));
        } else {
            console.error(`Failed to fetch match details: HTTP ${res.status}`);
        }
    } catch (e) {
        console.error(e);
    }
}

test().catch(console.error);
