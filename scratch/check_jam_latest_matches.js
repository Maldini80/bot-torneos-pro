import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const url = 'https://api.virtualprogaming.com/public/teams/JAM-ES/matches/?match_status=complete';
    console.log("=== FETCHING JAM ESPORTS LATEST COMPLETED MATCHES ===");
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const matches = await res.json();
            const list = Array.isArray(matches) ? matches : (matches.data || matches.results || []);
            console.log(`Found ${list.length} completed matches.`);
            
            // Look at the 2 most recent matches
            const recent = list.slice(0, 2);
            for (const m of recent) {
                console.log(`\nMatch ID: ${m.id} | Date: ${m.date || m.match_date} | ${m.team_home_name} vs ${m.team_away_name} | Score: ${m.home_score}-${m.away_score}`);
                
                // Fetch match details to get lineups and ratings
                const detailsUrl = `https://api.virtualprogaming.com/public/matches/${m.id}/`;
                const dRes = await fetch(detailsUrl, { headers: HEADERS });
                if (dRes.ok) {
                    const matchData = await dRes.json();
                    
                    const players = matchData.players || matchData.match_players || [];
                    console.log(`Match Players found: ${players.length}`);
                    
                    const raydenInMatch = players.find(p => p.username && p.username.toLowerCase() === 'zzraydenzz');
                    if (raydenInMatch) {
                        console.log("🎉 RAYDEN PLAYED THIS MATCH!");
                        console.log(JSON.stringify(raydenInMatch, null, 2));
                    } else {
                        console.log("Rayden did not play in this match.");
                        // Print list of usernames who played for JAM
                        const jamPlayers = players.filter(p => p.team_slug === 'JAM-ES');
                        console.log("JAM Players in match:", jamPlayers.map(p => `${p.username} (${p.rating || 'no rating'})`).join(', '));
                    }
                } else {
                    console.log(`Failed to fetch match details for match ID ${m.id}`);
                }
            }
        } else {
            console.log(`Failed to fetch matches: HTTP ${res.status}`);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
