import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function checkUrl(url) {
    console.log(`Checking URL: ${url}`);
    try {
        const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
        console.log(`Status: ${res.status} ${res.statusText}`);
        if (res.ok) {
            const text = await res.text();
            console.log(`Response snippet (first 300 chars):`);
            console.log(text.substring(0, 300));
            try {
                const json = JSON.parse(text);
                console.log(`Parsed successfully! Keys: ${Object.keys(json).join(', ')}`);
            } catch (err) {}
        }
    } catch (e) {
        console.error("Fetch error:", e.message);
    }
}

async function main() {
    const urls = [
        `https://api.virtualprogaming.com/public/teams/JAM-ES/stats/`,
        `https://api.virtualprogaming.com/public/teams/JAM-ES/fixtures/`,
        `https://api.virtualprogaming.com/public/teams/JAM-ES/results/`,
        `https://api.virtualprogaming.com/public/teams/JAM-ES/matches/`,
        `https://api.virtualprogaming.com/public/teams/JAM-ES/squad-list/`,
        `https://api.virtualprogaming.com/public/teams/JAM-ES/lineup/`,
        `https://api.virtualprogaming.com/public/teams/JAM-ES/players-list/`,
    ];
    
    for (const url of urls) {
        await checkUrl(url);
        console.log("-----------------------------------------");
    }
}

main().catch(console.error);
