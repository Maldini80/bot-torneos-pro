import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARDS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];

async function main() {
    const target = 'MonKeyDFFYLU';
    for (const board of LEADERBOARDS) {
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
            const url = `https://api.virtualprogaming.com/public/leagues/quinta-division-b-spain/leaderboard?leaderboard=${board}&limit=30&offset=${offset}`;
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
            const found = players.find(p => p.username === target);
            if (found) {
                console.log(`FOUND in quinta-division-b-spain ${board}:`, found);
            }
            if (players.length < 30) {
                hasMore = false;
            } else {
                offset += 30;
            }
        }
    }
    process.exit(0);
}

main().catch(console.error);
