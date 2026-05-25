import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const username = 'Aaron_GAMER_14';
    console.log(`Checking contracts for ${username}...`);
    try {
        const res = await fetch(`https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`, { headers: HEADERS });
        if (!res.ok) {
            console.error(`Failed to fetch contracts: ${res.status}`);
            return;
        }
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

run();
