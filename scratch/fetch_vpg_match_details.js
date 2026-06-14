import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function testMatchUrl(matchId) {
    const url = `https://api.virtualprogaming.com/public/matches/${matchId}/`;
    console.log(`\nFetching match detail: ${url}`);
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            console.log(`Match ID: ${data.id || data.match_id}`);
            console.log(`Teams: ${data.home_name || data.team_home_name} vs ${data.away_name || data.team_away_name}`);
            console.log(`Date: ${data.date || data.match_date}`);
            console.log(`EA Match ID: ${data.ea_match_id || data.eaMatchId}`);
            
            // Print rosters if they exist
            if (data.home_roster || data.away_roster || data.players) {
                console.log("Rosters / Players found in response.");
                const players = data.home_roster || data.away_roster || data.players || [];
                console.log(JSON.stringify(players, null, 2).substring(0, 1000));
            } else {
                console.log("No rosters/players field found in top level. Keys:", Object.keys(data));
                console.log(JSON.stringify(data, null, 2).substring(0, 1000));
            }
        } else {
            console.log(`Failed: ${res.status}`);
        }
    } catch (e) {
        console.error(`Error:`, e.message);
    }
}

async function run() {
    await testMatchUrl('1582797');
    await testMatchUrl('1582804');
    await testMatchUrl('1582814');
}
run();
