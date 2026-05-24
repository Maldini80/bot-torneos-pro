import fetch from 'node-fetch';

async function main() {
    const teamId = 24840;
    const paths = [
        `https://www.virtualpronetwork.com/api/team/view/${teamId}`,
        `https://www.virtualpronetwork.com/api/teams/view/${teamId}`,
        `https://www.virtualpronetwork.com/api/team/${teamId}/view`,
        `https://www.virtualpronetwork.com/api/teams/${teamId}/view`,
        `https://www.virtualpronetwork.com/api/apps/global/team/view/${teamId}`,
        `https://www.virtualpronetwork.com/api/apps/es/team/view/${teamId}`
    ];

    for (const url of paths) {
        console.log(`Probing: ${url}`);
        try {
            const res = await fetch(url);
            console.log(`Status: ${res.status} ${res.statusText}`);
            if (res.ok) {
                const data = await res.json();
                console.log("Success! Keys:", Object.keys(data));
                console.log("Sample:", JSON.stringify(data).substring(0, 500));
                return;
            }
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

main();
