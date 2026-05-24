import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    // Let's check contracts for a player
    const username = 'cris-borras';
    const url = `https://api.virtualprogaming.com/public/users/${username}/contracts/`;
    console.log(`Fetching contracts for user: ${username}`);
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            console.log("Contracts:", JSON.stringify(data, null, 2));
        } else {
            console.log("Status:", res.status);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
