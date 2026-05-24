import fetch from 'node-fetch';

async function main() {
    const teamId = 24840;
    try {
        const res = await fetch(`https://www.virtualpronetwork.com/api/teams/${teamId}`);
        if (res.ok) {
            const data = await res.json();
            console.log("Keys:", Object.keys(data));
            console.log("community:", JSON.stringify(data.community, null, 2));
            console.log("teamFormation:", JSON.stringify(data.teamFormation, null, 2));
            console.log("teamCountry:", JSON.stringify(data.teamCountry, null, 2));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
