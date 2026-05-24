import fetch from 'node-fetch';

async function main() {
    const compId = 52;
    const endpoints = [
        `https://www.virtualpronetwork.com/api/competitions/${compId}/players`,
        `https://www.virtualpronetwork.com/api/competitions/${compId}/users`,
        `https://www.virtualpronetwork.com/api/competitions/${compId}/contracts`,
        `https://www.virtualpronetwork.com/api/competitions/${compId}/rosters`,
        `https://www.virtualpronetwork.com/api/competitions/${compId}/members`
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
