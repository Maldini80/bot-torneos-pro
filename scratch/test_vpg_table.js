// scratch/test_vpg_table.js
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    try {
        const res = await fetch('https://api.virtualprogaming.com/public/leagues/superliga-spain-b/table/', { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            const standings = Array.isArray(data) ? data : (data.data || data.results || []);
            console.log('Sample VPG standings team fields:', JSON.stringify(standings.slice(0, 2), null, 2));
        } else {
            console.error('Error fetching table:', res.status, res.statusText);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
