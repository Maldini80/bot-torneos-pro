import fetch from 'node-fetch'; // or native fetch

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const url = 'https://api.virtualprogaming.com/public/leagues/quinta-division-d/table/';
    console.log('Fetching:', url);
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log('Status:', res.status, res.statusText);
        const text = await res.text();
        console.log('Response body (truncated):', text.substring(0, 1000));
    } catch (e) {
        console.error('Fetch error:', e);
    }
}
run();
