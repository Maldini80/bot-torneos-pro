import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const url = 'https://api.virtualprogaming.com/public/teams/GOLDEN-KNIGHTS/matches/?match_status=complete';
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const matchesData = await res.json();
            const matches = matchesData.data || [];
            matches.forEach(m => {
                if (m.match_day === 17 || m.match_day === 18) {
                    console.log(`Match Day ${m.match_day} VPG Match ID: ${m.id} | ${m.home_name} vs ${m.away_name}`);
                }
            });
        }
    } catch (e) {
        console.error(e);
    }
}
run();
