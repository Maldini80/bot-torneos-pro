const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function check(url) {
    console.log(`\nChecking URL: ${url}`);
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log("Status:", res.status);
        if (res.ok) {
            const data = await res.json();
            console.log("Data keys:", Object.keys(data));
            const arr = Array.isArray(data) ? data : (data.data || data.results || []);
            console.log(`Length: ${arr.length}`);
            if (arr.length > 0) {
                console.log("First item:", JSON.stringify(arr[0], null, 2));
            }
        }
    } catch (e) {
        console.log(`Error:`, e.message);
    }
}

async function test() {
    await check(`https://api.virtualprogaming.com/public/teams/?search=JAM`);
    await check(`https://api.virtualprogaming.com/public/teams/?name=JAM`);
    await check(`https://api.virtualprogaming.com/public/search/?query=JAM&type=team`);
}

test();
