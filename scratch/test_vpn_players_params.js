import fetch from 'node-fetch';

async function main() {
    const params = [
        `?limit=100`,
        `?team_id=29382`,
        `?teamId=29382`,
        `?team_id=24840`,
        `?teamId=24840`,
        `?league_id=2212`,
        `?leagueId=2212`
    ];

    for (const p of params) {
        const url = `https://www.virtualpronetwork.com/api/competitions/52/players${p}`;
        console.log(`Probing: ${url}`);
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                console.log(`-> count = ${data.count}, rows = ${data.rows ? data.rows.length : 'none'}`);
                if (data.rows && data.rows.length > 0) {
                    console.log("Sample player name:", data.rows[0].username || data.rows[0].user?.username || JSON.stringify(data.rows[0]).substring(0, 300));
                }
            } else {
                console.log(`-> HTTP error: ${res.status}`);
            }
        } catch (e) {
            console.error(e.message);
        }
    }
}

main();
