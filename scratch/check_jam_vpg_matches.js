const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const teamSlug = 'JAM-ES';
    
    console.log(`=== Fetching completed matches for ${teamSlug} ===`);
    const matchesUrl = `https://api.virtualprogaming.com/public/teams/${teamSlug}/matches/?match_status=complete`;
    try {
        const matchesRes = await fetch(matchesUrl, { headers: HEADERS });
        if (matchesRes.ok) {
            const matchesData = await matchesRes.json();
            const matches = Array.isArray(matchesData) ? matchesData : (matchesData.data || matchesData.results || []);
            
            console.log(`Total completed matches: ${matches.length}`);
            
            // Sort matches by datetime descending and print the newest 10 completed matches
            const sorted = matches.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
            console.log('\nNewest 10 Completed Matches:');
            for (const m of sorted.slice(0, 10)) {
                console.log(`  - Match ID: ${m.id} | Date: ${new Date(m.datetime).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
                console.log(`    Status: ${m.status} | Home: ${m.home_name} (${m.home_score}) vs Away: ${m.away_name} (${m.away_score})`);
                console.log(`    Match day: ${m.match_day}`);
            }
        } else {
            console.error(`Failed to fetch completed matches: HTTP ${matchesRes.status}`);
        }
    } catch (e) {
        console.error(e);
    }
}

test().catch(console.error);
