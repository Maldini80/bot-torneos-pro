import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const userId = 868909;
    const subpaths = [
        `https://api.virtualprogaming.com/public/users/${userId}/matches/`,
        `https://api.virtualprogaming.com/public/users/${userId}/history/`,
        `https://api.virtualprogaming.com/public/users/${userId}/performances/`,
        `https://api.virtualprogaming.com/public/users/${userId}/stats/`,
        `https://api.virtualprogaming.com/public/users/${userId}/results/`,
        `https://api.virtualprogaming.com/public/users/${userId}/fixtures/`,
        `https://api.virtualprogaming.com/public/users/${userId}/tournaments/`
    ];

    console.log(`=== TESTING SUBPATHS FOR VPG USER ID ${userId} ===`);
    for (const url of subpaths) {
        console.log(`\nURL: ${url}`);
        try {
            const res = await fetch(url, { headers: HEADERS });
            console.log(`Status: ${res.status}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`SUCCESS! Key count:`, Object.keys(data).length);
                console.log(JSON.stringify(data, null, 2).substring(0, 1000));
            }
        } catch (e) {
            console.error(e.message);
        }
    }
}
run();
