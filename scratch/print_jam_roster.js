import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const url = 'https://api.virtualprogaming.com/public/teams/JAM-ES/contracts/';
    console.log("=== LISTING ALL ACTIVE ROSTER USERNAMES FOR JAM ESPORTS ===");
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const contracts = await res.json();
            const active = contracts.filter(c => c.status === 'active');
            active.forEach((c, idx) => {
                console.log(`${idx + 1}. Username: "${c.username}" | Pos: ${c.position} | User ID: ${c.user_id} | Comm ID: ${c.community_id}`);
            });
        }
    } catch (e) {
        console.error(e);
    }
}
run();
