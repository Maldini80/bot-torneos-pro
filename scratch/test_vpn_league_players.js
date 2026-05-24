import fetch from 'node-fetch';

async function main() {
    const leagueId = 2212;
    const endpoints = [
        `https://www.virtualpronetwork.com/api/leagues/${leagueId}/players`,
        `https://www.virtualpronetwork.com/api/leagues/${leagueId}/contracts`,
        `https://www.virtualpronetwork.com/api/leagues/${leagueId}/users`,
        `https://www.virtualpronetwork.com/api/leagues/${leagueId}/roster`,
        `https://www.virtualpronetwork.com/api/leagues/${leagueId}/members`
    ];

    for (const url of endpoints) {
        console.log(`Probing: ${url}`);
        try {
            const res = await fetch(url);
            console.log(`Status: ${res.status} ${res.statusText}`);
            if (res.ok) {
                const data = await res.json();
                console.log("Success! Keys:", Object.keys(data));
                console.log("Sample:", JSON.stringify(data).substring(0, 500));
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

main();
