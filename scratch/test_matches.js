const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const url = 'https://api.virtualprogaming.com/public/teams/monta-esports-club/matches/?match_status=scheduled';
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.data || data.results || []);
        console.log("Length:", arr.length);
        if (arr.length > 0) {
            console.log("First match:", JSON.stringify(arr[0], null, 2));
        }
    } else {
        console.log("Error:", res.status, res.statusText);
    }
}
test();
