import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const matchId = 1585370;
    const subpaths = [
        `https://api.virtualprogaming.com/public/matches/${matchId}/performances/`,
        `https://api.virtualprogaming.com/public/matches/${matchId}/stats/`,
        `https://api.virtualprogaming.com/public/matches/${matchId}/players/`,
        `https://api.virtualprogaming.com/public/matches/${matchId}/lineup/`
    ];

    for (const url of subpaths) {
        console.log(`\nURL: ${url}`);
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            console.log(`Success! Type:`, typeof data, `Array?`, Array.isArray(data));
            if (Array.isArray(data)) {
                console.log(`Length:`, data.length);
                if (data.length > 0) {
                    console.log(`First item:`, JSON.stringify(data[0], null, 2));
                }
            } else {
                console.log(`Keys:`, Object.keys(data));
                console.log(`Data preview:`, JSON.stringify(data, null, 2).substring(0, 500));
            }
        } else {
            console.log(`Error: HTTP ${res.status}`);
        }
    }
}
run().catch(console.error);
