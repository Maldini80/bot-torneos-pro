import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    console.log('=== DUMP DE LÍDERES DE VPG ===\n');
    const url = 'https://api.virtualprogaming.com/public/leagues/superliga-spain-b/leaderboard?leaderboard=top_fb&type=all&limit=5';
    
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            console.log(JSON.stringify(data.data || data, null, 2));
        } else {
            console.log(`Error: ${res.status}`);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}
run();
