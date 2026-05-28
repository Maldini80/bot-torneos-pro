import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function checkUrl(url) {
    console.log(`Checking URL: ${url}`);
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log(`Status: ${res.status} ${res.statusText}`);
        if (res.ok) {
            const json = await res.json();
            console.log("Parsed response keys:", Object.keys(json));
            console.log(JSON.stringify(json, null, 2).substring(0, 1500));
        } else {
            console.log("Error response:", await res.text());
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
    console.log("-----------------------------------------");
}

async function run() {
    const userId = 909590;
    const username = "zzRaydenzz";
    
    // Check some possible user subpaths
    await checkUrl(`https://api.virtualprogaming.com/public/users/${userId}/stats/`);
    await checkUrl(`https://api.virtualprogaming.com/public/users/${username}/stats/`);
    await checkUrl(`https://api.virtualprogaming.com/public/users/${userId}/matches/`);
    await checkUrl(`https://api.virtualprogaming.com/public/users/${userId}/history/`);
}
run();
