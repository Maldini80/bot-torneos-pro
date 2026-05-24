const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function checkUrl(url) {
    console.log(`Checking: ${url}`);
    const res = await fetch(url, { headers: HEADERS });
    console.log(`Status: ${res.status}`);
    if (res.ok) {
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    }
}

async function test() {
    await checkUrl('https://api.virtualprogaming.com/public/users/cris-borras/');
    await checkUrl('https://api.virtualprogaming.com/public/users/david_parla17/');
}
test();
