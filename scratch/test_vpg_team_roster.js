async function test() {
    const teamSlug = 'banano-esport';
    const url = `https://api.virtualprogaming.com/public/teams/${teamSlug}/contracts/`;
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
                'Accept': 'application/json',
            }
        });
        if (res.ok) {
            const data = await res.json();
            const values = Object.values(data);
            console.log('Total contracts:', values.length);
            if (values.length > 0) {
                console.log('Sample contract:', JSON.stringify(values[0], null, 2));
            }
        }
    } catch (e) {
        console.error(e);
    }
}
test();
