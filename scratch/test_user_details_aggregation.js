const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function fetchUserDetail(username) {
    try {
        const res = await fetch(`https://api.virtualprogaming.com/public/users/${username}/`, { headers: HEADERS });
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error("Error fetching", username, e.message);
    }
    return null;
}

async function test() {
    const contracts = [
        { username: 'cris-borras' },
        { username: 'david_parla17' }
    ];
    
    console.time("fetchConcurrently");
    const details = await Promise.all(
        contracts.map(async (c) => {
            const detail = await fetchUserDetail(c.username);
            return {
                username: c.username,
                psn: detail ? detail.psn : null,
                xbox: detail ? detail.xbox : null,
                origin: detail ? detail.origin : null,
                bio: detail ? detail.bio : null
            };
        })
    );
    console.timeEnd("fetchConcurrently");
    
    console.log("Details:", JSON.stringify(details, null, 2));
}
test();
