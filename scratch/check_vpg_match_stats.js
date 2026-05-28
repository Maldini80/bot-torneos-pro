const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const matchId = '1580165';
    const subpaths = [
        `https://api.virtualprogaming.com/public/matches/${matchId}/performances/`,
        `https://api.virtualprogaming.com/public/matches/${matchId}/stats/`,
        `https://api.virtualprogaming.com/public/matches/${matchId}/players/`,
        `https://api.virtualprogaming.com/public/matches/${matchId}/lineup/`
    ];
    
    for (const url of subpaths) {
        console.log(`\nTrying: ${url}`);
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const data = await res.json();
                console.log(`Success! Data preview:`, JSON.stringify(data, null, 2).substring(0, 1000));
            } else {
                console.log(`Failed: HTTP ${res.status}`);
            }
        } catch (e) {
            console.error(e.message);
        }
    }
}

test().catch(console.error);
