import fetch from 'node-fetch';

async function main() {
    const teamId = 24840;
    const urls = [
        `https://www.virtualpronetwork.com/api/contracts?team_id=${teamId}`,
        `https://www.virtualpronetwork.com/api/contracts?team1=${teamId}`,
        `https://www.virtualpronetwork.com/api/contracts?team=${teamId}`,
        `https://www.virtualpronetwork.com/api/users?team_id=${teamId}`,
        `https://www.virtualpronetwork.com/api/users?team=${teamId}`,
        `https://www.virtualpronetwork.com/api/players?team_id=${teamId}`,
        `https://www.virtualpronetwork.com/api/team-members?team_id=${teamId}`,
        `https://www.virtualpronetwork.com/api/teams-users?team_id=${teamId}`
    ];

    for (const url of urls) {
        console.log(`\nProbing: ${url}`);
        try {
            const res = await fetch(url);
            console.log(`Status: ${res.status} ${res.statusText}`);
            if (res.ok) {
                const data = await res.json();
                console.log("Success! Keys:", Object.keys(data));
                const str = JSON.stringify(data);
                console.log("Sample:", str.substring(0, 500));
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

main();
