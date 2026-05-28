import { fetchVpgSpainLeagues } from '../src/utils/vpgCrawler.js';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARDS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];

async function main() {
    const leagues = await fetchVpgSpainLeagues();
    const targetUsernames = ['nestor007'];
    
    console.log("Searching VPG API live for nestor007...");
    
    for (const league of leagues) {
        console.log(`Checking league: ${league.slug}...`);
        for (const board of LEADERBOARDS) {
            let offset = 0;
            let hasMore = true;
            while (hasMore) {
                const url = `https://api.virtualprogaming.com/public/leagues/${league.slug}/leaderboard?leaderboard=${board}&limit=50&offset=${offset}`;
                try {
                    const res = await fetch(url, { headers: HEADERS });
                    if (!res.ok) {
                        hasMore = false;
                        continue;
                    }
                    const data = await res.json();
                    const players = data.data || [];
                    if (players.length === 0) {
                        hasMore = false;
                        continue;
                    }
                    for (const p of players) {
                        if (targetUsernames.some(t => String(p.username).toLowerCase() === t.toLowerCase())) {
                            console.log(`\nFOUND LIVE: ${p.username} in league ${league.slug}, leaderboard ${board}:`);
                            console.log(`- Points: ${p.points}`);
                            console.log(`- Team: ${p.team_name} (slug: ${p.team_slug})`);
                            console.log(`- Matches: ${p.matches_played}`);
                            console.log(`- Goals: ${p.goals}`);
                            console.log(`- Assists: ${p.assists}`);
                            console.log(`- Rating Sum: ${p.match_rating}`);
                        }
                    }
                    if (players.length < 50) {
                        hasMore = false;
                    } else {
                        offset += 50;
                    }
                } catch (e) {
                    console.error(`Error fetching ${league.slug} ${board}:`, e.message);
                    hasMore = false;
                }
            }
        }
    }
    process.exit(0);
}

main().catch(console.error);
