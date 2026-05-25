import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function checkContracts() {
    const username = 'MONKEYDFFYLU';
    console.log(`Checking VPG contracts for ${username}...`);
    
    try {
        // We'll try the contracts endpoint
        const contractsUrl = `https://api.virtualprogaming.com/public/users/${username}/contracts/`;
        const res = await fetch(contractsUrl, { headers: HEADERS });
        if (!res.ok) {
            console.log(`Failed to fetch contracts: ${res.status}`);
            return;
        }
        const data = await res.json();
        console.log('Contracts Data:');
        console.log(JSON.stringify(data, null, 2));
        
        // Also check general profile data
        const profileUrl = `https://api.virtualprogaming.com/public/users/${username}/`;
        const resProfile = await fetch(profileUrl, { headers: HEADERS });
        if (resProfile.ok) {
            const dataProfile = await resProfile.json();
            console.log('\nProfile Data:');
            console.log(JSON.stringify(dataProfile, null, 2));
        }
        
    } catch (err) {
        console.error(`Error:`, err.message);
    }
}

checkContracts();
