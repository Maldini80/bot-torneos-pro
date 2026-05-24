import fetch from 'node-fetch';

async function main() {
    try {
        const res = await fetch("https://www.virtualpronetwork.com/api/competitions/52/teams");
        if (res.ok) {
            const data = await res.json();
            console.log("Response type:", typeof data, "Is Array:", Array.isArray(data));
            console.log("Response keys:", Object.keys(data));
            const str = JSON.stringify(data);
            console.log("Sample response:", str.substring(0, 1000));
        } else {
            console.error("Failed to fetch teams:", res.status, res.statusText);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
