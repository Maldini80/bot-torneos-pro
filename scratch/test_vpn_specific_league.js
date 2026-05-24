import fetch from 'node-fetch';

async function main() {
    const seasonId = 6377;
    const url = `https://www.virtualpronetwork.com/api/leagues/2212/table?season=${seasonId}`;
    console.log(`Fetching table from: ${url}`);
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            console.log("Is array:", Array.isArray(data));
            const keys = Object.keys(data);
            console.log("Top-level keys (first 10):", keys.slice(0, 10));
            console.log("First item key:", keys[0]);
            console.log("First item value keys:", Object.keys(data[keys[0]]));
            console.log("First item data sample:", JSON.stringify(data[keys[0]], null, 2).substring(0, 800));
        } else {
            console.error("HTTP error:", res.status, res.statusText);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
