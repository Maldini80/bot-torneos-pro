async function test() {
    const username = 'nestor007';
    const url = `https://api.virtualprogaming.com/public/users/${username}/`;
    const contractsUrl = `https://api.virtualprogaming.com/public/users/${username}/contracts/`;
    
    console.log('Fetching user detail:', url);
    const headers = {
        'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
        'Accept': 'application/json',
    };

    try {
        const res = await fetch(url, { headers });
        if (res.ok) {
            const data = await res.json();
            console.log('--- User Info ---');
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log('Status User:', res.status);
        }

        console.log('\nFetching user contracts:', contractsUrl);
        const resC = await fetch(contractsUrl, { headers });
        if (resC.ok) {
            const dataC = await resC.json();
            console.log('--- User Contracts ---');
            console.log(JSON.stringify(dataC, null, 2));
        } else {
            console.log('Status Contracts:', resC.status);
        }
    } catch (e) {
        console.error(e);
    }
}
test();
