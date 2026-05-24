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
            console.log(`Response snippet (first 600 chars):`);
            console.log(text.substring(0, 600));
            try {
                const json = JSON.parse(text);
                console.log(`Parsed successfully! Keys: ${Object.keys(json).join(', ')}`);
                if (Array.isArray(json)) {
                    console.log(`Length: ${json.length}`);
                } else if (json.data) {
                    if (Array.isArray(json.data)) {
                        console.log(`Data length: ${json.data.length}`);
                    }
                }
            } catch (err) {
                console.log("JSON Parse Error:", err.message);
            }
        } else {
            console.log("Error body:", await res.text().catch(() => ''));
        }
    } catch (e) {
        console.error("Fetch error:", e.message);
    }
}

async function main() {
    const urls = [
        `https://api.virtualprogaming.com/public/teams/20699/`,
        `https://api.virtualprogaming.com/public/teams/20699/players/`,
        `https://api.virtualprogaming.com/public/teams/20699/users/`,
        `https://api.virtualprogaming.com/public/teams/20699/roster/`,
        `https://api.virtualprogaming.com/public/teams/JAM-ES/users/`,
    ];
    
    for (const url of urls) {
        await checkUrl(url);
        console.log("-----------------------------------------");
    }
}

main().catch(console.error);
