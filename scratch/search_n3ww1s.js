const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARDS = ['highest_rated', 'top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
const LEAGUES = ['superliga-spain-a', 'superliga-spain-b'];

async function main() {
    console.log("Searching VPG API live for N3WW1S_...");
    for (const slug of LEAGUES) {
        for (const board of LEADERBOARDS) {
            const url = `https://api.virtualprogaming.com/public/leagues/${slug}/leaderboard?leaderboard=${board}&limit=100`;
            try {
                const res = await fetch(url, { headers: HEADERS });
                if (!res.ok) continue;
                const data = await res.json();
                const players = data.data || data || [];
                if (Array.isArray(players)) {
                    for (const p of players) {
                        if (p.username && p.username.toLowerCase().includes('n3ww1s')) {
                            console.log(`\nFOUND LIVE: ${p.username} in league ${slug}, leaderboard ${board}:`);
                            console.log(JSON.stringify(p, null, 2));
                        }
                    }
                }
            } catch (e) {
                console.error(`Error fetching ${slug} ${board}:`, e.message);
            }
        }
    }
    console.log("\nSearch complete.");
    process.exit(0);
}

main().catch(console.error);
