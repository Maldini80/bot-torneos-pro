const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const res = await fetch('https://api.virtualprogaming.com/public/teams/monta-esports-club/contracts/', { headers: HEADERS });
    const data = await res.json();
    const c483 = data.filter(c => c.community_id === 483);
    const c479 = data.filter(c => c.community_id === 479);
    console.log("Total:", data.length);
    console.log("Community 483 count:", c483.length);
    console.log("Community 483 names:", c483.map(c => c.username));
    console.log("Community 479 count:", c479.length);
    console.log("Community 479 names:", c479.map(c => c.username));
}
test();
