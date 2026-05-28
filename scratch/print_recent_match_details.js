import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const teamSlug = 'JAM-ES';
    const matchesUrl = `https://api.virtualprogaming.com/public/teams/${teamSlug}/matches/?match_status=complete`;
    try {
        const res = await fetch(matchesUrl, { headers: HEADERS });
        if (res.ok) {
            const matches = await res.json();
            const list = Array.isArray(matches) ? matches : (matches.data || matches.results || []);
            if (list.length === 0) {
                console.log("No completed matches found.");
                return;
            }
            
            const sorted = list.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
            const latestMatch = sorted[0];
            console.log(`=== LATEST MATCH ID: ${latestMatch.id} ===`);
            console.log(`Home: ${latestMatch.home_name} (${latestMatch.home_score}) vs Away: ${latestMatch.away_name} (${latestMatch.away_score})`);
            console.log(`Date: ${latestMatch.datetime}`);

            const detailsUrl = `https://api.virtualprogaming.com/public/matches/${latestMatch.id}/`;
            console.log(`Fetching details from: ${detailsUrl}`);
            const dRes = await fetch(detailsUrl, { headers: HEADERS });
            if (dRes.ok) {
                const details = await dRes.json();
                console.log("Details keys:", Object.keys(details));
                
                // Let's search inside the details object for 'players', 'roster', 'stats', 'home_team', 'away_team', etc.
                console.log("Details sample:");
                console.log(JSON.stringify(details, (key, value) => {
                    if (Array.isArray(value) && value.length > 5) {
                        return [value[0], `... (${value.length - 1} more items)`];
                    }
                    return value;
                }, 2));
            } else {
                console.log(`Failed details: HTTP ${dRes.status}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}
run();
