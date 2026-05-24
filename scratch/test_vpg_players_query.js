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
            try {
                const json = JSON.parse(text);
                const arr = Array.isArray(json) ? json : (json.data || json.results || []);
                console.log(`Length: ${arr.length}`);
                if (arr.length > 0) {
                    console.log("First item sample:", JSON.stringify(arr[0], null, 2));
                }
            } catch (err) {
                console.log("Not JSON:", text.substring(0, 300));
            }
        }
    } catch (e) {
        console.error("Fetch error:", e.message);
    }
}

async function main() {
    // 21219 is Zenturions
    await checkUrl(`https://api.virtualprogaming.com/public/players/?team_id=21219`);
    await checkUrl(`https://api.virtualprogaming.com/public/users/?team_id=21219`);
}

main().catch(console.error);
