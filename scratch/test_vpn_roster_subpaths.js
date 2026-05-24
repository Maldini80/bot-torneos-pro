import fetch from 'node-fetch';

async function main() {
    const teamId = 24840;
    const subpaths = [
        'users', 'players', 'roster', 'members', 'contracts',
        'team_users', 'team-users', 'teamusers',
        'team_players', 'team-players', 'teamplayers',
        'team_members', 'team-members', 'teammembers',
        'rosters', 'memberships', 'signings', 'transfers'
    ];

    for (const sub of subpaths) {
        const url = `https://www.virtualpronetwork.com/api/teams/${teamId}/${sub}`;
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
    console.log("Finished probing subpaths.");
}

main();
