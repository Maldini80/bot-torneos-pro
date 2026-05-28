const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const username = "satitajr";
    const userUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/`;
    
    console.log(`Querying VPG API for user: ${username}...`);
    try {
        const userRes = await fetch(userUrl, { headers: HEADERS });
        if (userRes.ok) {
            const userData = await userRes.json();
            console.log('User Profile Data:', JSON.stringify(userData, null, 2));
        } else {
            console.log(`Failed to fetch profile: HTTP ${userRes.status}`);
        }
        
        // Search all leaderboards in superliga-spain-a for satitajr
        const LEADERBOARDS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
        console.log(`\nSearching for ${username} across all leaderboards in superliga-spain-a...`);
        for (const lb of LEADERBOARDS) {
            const lbUrl = `https://api.virtualprogaming.com/public/leagues/superliga-spain-a/leaderboard?leaderboard=${lb}&type=all&limit=250`;
            const lbRes = await fetch(lbUrl, { headers: HEADERS });
            if (lbRes.ok) {
                const lbData = await lbRes.json();
                const players = lbData.data || [];
                const found = players.find(p => p.username && p.username.toLowerCase() === username.toLowerCase());
                if (found) {
                    console.log(`Found in leaderboard: "${lb}"!`);
                    console.log(` - Matches: ${found.matches_played} | Points: ${found.points}`);
                    console.log(JSON.stringify(found, null, 2));
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}
run();
