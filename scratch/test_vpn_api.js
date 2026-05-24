import fetch from 'node-fetch'; // package.json doesn't have node-fetch, but standard fetch is available in Node 18+! Let's just use global fetch.

async function main() {
    console.log("Querying competition 52...");
    try {
        const res = await fetch("https://www.virtualpronetwork.com/api/competitions/52");
        if (!res.ok) {
            console.error("HTTP error:", res.status, res.statusText);
        } else {
            const data = await res.json();
            console.log("Competition data loaded successfully!");
            console.log("Competition structure fields:", Object.keys(data));
            if (data.leagues) {
                console.log(`Leagues count: ${data.leagues.length}`);
                console.log("Sample league:", JSON.stringify(data.leagues[0], null, 2));
            } else {
                console.log("Sample response:", JSON.stringify(data).substring(0, 1000));
            }
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

main();
