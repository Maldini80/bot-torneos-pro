import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const username = "zzRaydenzz";
    const userUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/`;
    const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
    
    console.log(`Querying VPG API for user: ${username}...`);
    try {
        const userRes = await fetch(userUrl, { headers: HEADERS });
        if (userRes.ok) {
            const userData = await userRes.json();
            console.log('User Profile Data:', JSON.stringify(userData, null, 2));
        } else {
            console.log(`Failed to fetch profile: HTTP ${userRes.status}`);
        }
        
        console.log(`\nQuerying contracts...`);
        const contractRes = await fetch(contractsUrl, { headers: HEADERS });
        if (contractRes.ok) {
            const contracts = await contractRes.json();
            console.log('Contracts Data:', JSON.stringify(contracts, null, 2));
        } else {
            console.log(`Failed to fetch contracts: HTTP ${contractRes.status}`);
        }
        
        // Query the leaderboard
        console.log(`\nSearching in leaderboard...`);
        const lbUrl = `https://api.virtualprogaming.com/public/leagues/superliga-spain-a/leaderboard?leaderboard=top_cb&type=all&limit=100`;
        const lbRes = await fetch(lbUrl, { headers: HEADERS });
        if (lbRes.ok) {
            const lbData = await lbRes.json();
            const players = lbData.data || [];
            const found = players.find(p => p.username && p.username.toLowerCase() === username.toLowerCase());
            if (found) {
                console.log('Found in top_cb leaderboard:', JSON.stringify(found, null, 2));
            } else {
                console.log('Not found in top_cb top 100.');
            }
        }
        
    } catch (e) {
        console.error(e);
    }
}
run();
