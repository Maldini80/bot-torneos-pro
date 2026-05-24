import fetch from 'node-fetch';

async function main() {
    const teamId = 24840;
    const paths = [
        `team_members`, `team-members`, `teammembers`,
        `team_players`, `team-players`, `teamplayers`,
        `rosters`, `roster`, `contracts`, `contract`,
        `players`, `player`, `users`, `user`,
        `members`, `member`
    ];

    for (const p of paths) {
        // probe as query param
        const url1 = `https://www.virtualpronetwork.com/api/${p}?team_id=${teamId}`;
        const url2 = `https://www.virtualpronetwork.com/api/${p}?teamId=${teamId}`;
        const url3 = `https://www.virtualpronetwork.com/api/${p}?team=${teamId}`;
        
        for (const url of [url1, url2, url3]) {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    console.log(`\n🎉 SUCCESS: ${url}`);
                    const data = await res.json();
                    console.log("Keys:", Object.keys(data));
                    console.log("Sample:", JSON.stringify(data).substring(0, 500));
                    return;
                }
            } catch (e) {
                // ignore
            }
        }
    }
    console.log("Finished probing query params.");
}

main();
