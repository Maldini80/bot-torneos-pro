async function run() {
    const username = 'AlbertoSG_97';
    const url = `https://api.virtualprogaming.com/public/users/${username}/contracts/`;
    console.log('Fetching contracts:', url);
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
                'Accept': 'application/json',
            }
        });
        if (res.ok) {
            const data = await res.json();
            console.log('Contracts:', JSON.stringify(data, null, 2));
        } else {
            console.log('Status:', res.status);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
