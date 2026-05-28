import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    const HEADERS = {
        'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
        'Accept': 'application/json',
    };
    
    // Team ID for Columbus Pacers is 21433 (from VPG contracts output)
    const teamId = 21433;
    
    console.log(`Checking match history for Columbus Pacers (ID: ${teamId}) on VPG API...`);
    
    // Let's try some common VPG match endpoints
    const urls = [
        `https://api.virtualprogaming.com/public/teams/${teamId}/matches/`,
        `https://api.virtualprogaming.com/public/teams/${teamId}/results/`,
        `https://api.virtualprogaming.com/public/teams/${teamId}/fixtures/`
    ];
    
    for (const url of urls) {
        try {
            console.log(`\nFetching: ${url}`);
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const data = await res.json();
                const matches = data.data || data || [];
                console.log(`Success! Found ${Array.isArray(matches) ? matches.length : 'object'} results.`);
                if (Array.isArray(matches) && matches.length > 0) {
                    console.log('Sample match:', JSON.stringify(matches[0], null, 2));
                    // Let's print dates of recent matches
                    matches.slice(0, 10).forEach(m => {
                        console.log(`- Match ID: ${m.id || m.match_id} | Date: ${m.date || m.match_date || m.time} | Score: ${m.team_a_score}-${m.team_b_score}`);
                    });
                }
            } else {
                console.log(`HTTP ${res.status}`);
            }
        } catch (e) {
            console.error(e.message);
        }
    }
    
    process.exit(0);
}

run();
