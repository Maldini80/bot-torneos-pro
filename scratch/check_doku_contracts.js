// scratch/check_doku_contracts.js
import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function main() {
    const username = 'xDoku_11';
    const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
    console.log(`Fetching contracts from: ${contractsUrl}`);
    
    try {
        const res = await fetch(contractsUrl, { headers: HEADERS });
        if (!res.ok) {
            console.error(`HTTP error: ${res.status}`);
            return;
        }
        const contracts = await res.json();
        console.log(`Contracts for ${username}:`, JSON.stringify(contracts, null, 2));
    } catch (e) {
        console.error(`Error:`, e.message);
    }
}

main();
