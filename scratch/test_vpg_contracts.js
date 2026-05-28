import fetch from 'node-fetch'; // Wait, let's see if node-fetch is available. We can just use global fetch since node v24 has global fetch!

async function run() {
    const HEADERS = {
        'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
        'Accept': 'application/json',
    };

    const usernames = ['MONKEYDFFYLU', 'Aaron14', 'TSX-Juanri2'];

    for (const username of usernames) {
        const url = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
        console.log(`Fetching contracts for ${username}...`);
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const contracts = await res.json();
                console.log(`Contracts for ${username}:`, JSON.stringify(contracts, null, 2));
            } else {
                console.log(`Failed for ${username}: ${res.status}`);
            }
        } catch (e) {
            console.error(e);
        }
    }
}

run();
