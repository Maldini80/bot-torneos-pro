import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const variations = [
    'quinta-division-c-spain',
    'quinta-division-c',
    'quinta-c-spain',
    'quinta-c',
    'quinta-div-c-spain',
    'quinta-division-spain-c',
    'quinta-division-c-es',
    'quinta-division-c-spain-ps5',
    'quinta-division-c-spain-xsx',
    'quinta-division-c-esports',
    'quinta-division-c-spain-crossplay',
    'quinta-division-c-spain-cross',
    '5-division-c-spain',
    '5a-division-c-spain',
    'quinta-c-spain-crossplay'
];

async function run() {
    for (const v of variations) {
        const url = `https://api.virtualprogaming.com/public/leagues/${v}/table/`;
        try {
            const res = await fetch(url, { headers: HEADERS });
            console.log(`Slug: "${v}" -> Status: ${res.status} ${res.statusText}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`  🎉 SUCCESS! Found league table with data.`);
            }
        } catch (e) {
            console.error(`  Error for ${v}:`, e.message);
        }
    }
}
run();
