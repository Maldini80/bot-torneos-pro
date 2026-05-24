const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const teamSlug = 'Team-GMASK'; // GMK Villarreal CF - Esports Premier (1a División)
    
    console.log(`=== Fetching ALL completed matches for ${teamSlug} ===`);
    const matchesUrl = `https://api.virtualprogaming.com/public/teams/${teamSlug}/matches/?match_status=complete`;
    const matchesRes = await fetch(matchesUrl, { headers: HEADERS });
    const matchesData = await matchesRes.json();
    const matches = Array.isArray(matchesData) ? matchesData : (matchesData.data || matchesData.results || []);
    
    console.log(`Total completed matches: ${matches.length}`);
    
    // Extract unique dates (in Europe/Madrid timezone)
    const uniqueDates = new Set();
    for (const m of matches) {
        if (m.datetime) {
            const d = new Date(m.datetime);
            const madridDate = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD format
            uniqueDates.add(madridDate);
        }
    }
    
    const sortedDates = Array.from(uniqueDates).sort();
    console.log(`\nUnique match dates (Madrid time): ${sortedDates.length}`);
    sortedDates.forEach(d => {
        const dayName = new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'Europe/Madrid' });
        console.log(`  ${d} (${dayName})`);
    });

    // Also try scheduled matches
    console.log(`\n=== Fetching SCHEDULED matches ===`);
    const schedUrl = `https://api.virtualprogaming.com/public/teams/${teamSlug}/matches/?match_status=scheduled`;
    const schedRes = await fetch(schedUrl, { headers: HEADERS });
    const schedData = await schedRes.json();
    const sched = Array.isArray(schedData) ? schedData : (schedData.data || schedData.results || []);
    console.log(`Scheduled matches: ${sched.length}`);
    if (sched.length > 0) {
        for (const m of sched) {
            if (m.datetime) {
                const d = new Date(m.datetime);
                const madridDate = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
                const madridTime = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
                console.log(`  ${madridDate} ${madridTime} - ${m.home_name} vs ${m.away_name} (Jornada ${m.match_day})`);
            }
        }
    }

    // Try to also get ALL matches (no filter)
    console.log(`\n=== Fetching ALL matches (no filter) ===`);
    const allUrl = `https://api.virtualprogaming.com/public/teams/${teamSlug}/matches/`;
    const allRes = await fetch(allUrl, { headers: HEADERS });
    const allData = await allRes.json();
    const allMatches = Array.isArray(allData) ? allData : (allData.data || allData.results || []);
    console.log(`All matches: ${allMatches.length}`);
    
    const allDates = new Set();
    for (const m of allMatches) {
        if (m.datetime) {
            const d = new Date(m.datetime);
            const madridDate = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
            const madridTime = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
            allDates.add(`${madridDate} ${madridTime} [${m.status}] J${m.match_day}: ${m.home_name} vs ${m.away_name}`);
        }
    }
    Array.from(allDates).sort().forEach(s => console.log(`  ${s}`));
}

test().catch(console.error);
