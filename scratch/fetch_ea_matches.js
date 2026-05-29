import fetch from 'node-fetch';

const EA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.ea.com/"
};

async function fetchMatches(clubId, platform, matchType) {
    const url = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${clubId}&platform=${platform}&matchType=${matchType}`;
    console.log(`Fetching ${matchType} for club ${clubId} on platform ${platform}...`);
    try {
        const res = await fetch(url, { headers: EA_HEADERS });
        if (res.ok) {
            const data = await res.json();
            return Array.isArray(data) ? data : Object.values(data || {});
        }
        console.log(`Failed to fetch ${matchType}: HTTP ${res.status}`);
        return [];
    } catch (e) {
        console.error(`Error fetching ${matchType}:`, e.message);
        return [];
    }
}

async function run() {
    const clubId = "5549"; // Golden Knights
    const platform = "common-gen5";

    const friendlyMatches = await fetchMatches(clubId, platform, 'friendlyMatch');
    const clubMatches = await fetchMatches(clubId, platform, 'clubMatch');

    const allMatches = [...friendlyMatches, ...clubMatches];
    console.log(`\nTotal matches fetched from EA API: ${allMatches.length}`);

    // Sort matches by timestamp descending
    allMatches.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));

    console.log('\n--- MATCHES LIST ---');
    for (const m of allMatches) {
        const date = new Date(parseInt(m.timestamp) * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
        const clubs = Object.values(m.clubs || {});
        const homeClub = clubs[0] || {};
        const awayClub = clubs[1] || {};
        console.log(`\nMatch ID: ${m.matchId} | Date: ${date} | Type: ${m.matchType}`);
        console.log(`  ${homeClub.name} (${homeClub.goals}) vs ${awayClub.name} (${awayClub.goals})`);
        
        // Find players in this match
        if (m.players && m.players[clubId]) {
            const players = Object.values(m.players[clubId]);
            console.log(`  Golden Knights Players:`);
            players.forEach(p => {
                const isPanda = p.playername.toLowerCase().includes('panda');
                const mark = isPanda ? '⭐ [PANDA]' : '  ';
                console.log(`    ${mark} ${p.playername} | Pos: ${p.pos} | Rating: ${p.rating} | Goals: ${p.goals} | Assists: ${p.assists}`);
            });
        }
    }
}

run();
