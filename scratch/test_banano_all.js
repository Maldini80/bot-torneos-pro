const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const res = await fetch('https://api.virtualprogaming.com/public/teams/banano-esport/contracts/', { headers: HEADERS });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
test();
