// scratch/test_ceuta.js

const VPG_HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function fetchFromVpg(path) {
    const [basePath, queryString] = path.split('?');
    const formattedBasePath = basePath.endsWith('/') ? basePath : basePath + '/';
    const url = `https://api.virtualprogaming.com/public/${formattedBasePath}${queryString ? '?' + queryString : ''}`;
    const res = await fetch(url, { headers: VPG_HEADERS, redirect: 'follow' });
    if (!res.ok) {
        throw new Error(`VPG API error: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

async function fetchUserContracts(username) {
    try {
        const data = await fetchFromVpg(`users/${username}/contracts/`);
        return data && Array.isArray(data.value) ? data.value : [];
    } catch (e) {
        return [];
    }
}

async function main() {
    try {
        const teamSlug = 'ceuta-guardians';
        const communityId = 483;
        console.log(`Fetching contracts for ${teamSlug}...`);
        const rawContracts = await fetchFromVpg(`teams/${teamSlug}/contracts/`);
        console.log(`Total raw contracts: ${rawContracts.length}`);

        const filteredContracts = [];
        await Promise.all(
            rawContracts.map(async (c) => {
                if (c.community_id === communityId) {
                    filteredContracts.push(c);
                    return;
                }
                // Check if they play for another team in the target community
                const userContracts = await fetchUserContracts(c.username);
                const playsElsewhere = userContracts.some(uc => 
                    uc.status === 'active' && 
                    uc.community_id === communityId && 
                    uc.team_id !== c.team_id
                );
                if (!playsElsewhere) {
                    filteredContracts.push(c);
                } else {
                    console.log(`EXCLUDED (plays elsewhere): ${c.username} (community ${c.community_id})`);
                }
            })
        );

        console.log(`\nFiltered contracts (${filteredContracts.length}):`);
        filteredContracts.forEach(c => {
            console.log(`- ${c.username} (Community: ${c.community_id})`);
        });
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
