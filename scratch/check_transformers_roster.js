import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const teamSlug = 'elpatiocf'; // Transformers CF
    console.log(`Checking official VPG roster for Transformers CF (${teamSlug})...`);
    try {
        const res = await fetch(`https://api.virtualprogaming.com/public/teams/${teamSlug}/contracts/`, { headers: HEADERS });
        if (!res.ok) {
            console.error(`Failed to fetch team contracts: ${res.status}`);
            return;
        }
        const data = await res.json();
        console.log(`Found ${data.length} contracts:`);
        data.forEach(c => {
            console.log(`- ${c.username} (PSN: ${c.psn}, Status: ${c.status}, matches_left: ${c.matches_left})`);
        });
    } catch (e) {
        console.error(e);
    }
}

run();
