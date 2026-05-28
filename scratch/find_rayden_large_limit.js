import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARDS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];

async function run() {
    const username = "zzRaydenzz";
    console.log(`Searching for ${username} across all leaderboards in superliga-spain-a with limit=1000...`);
    
    for (const lb of LEADERBOARDS) {
        // Querying with offset=0 and limit=1000
        const lbUrl = `https://api.virtualprogaming.com/public/leagues/superliga-spain-a/leaderboard?leaderboard=${lb}&type=all&limit=1000&offset=0`;
        try {
            const lbRes = await fetch(lbUrl, { headers: HEADERS });
            if (lbRes.ok) {
                const lbData = await lbRes.json();
                const players = lbData.data || [];
                const found = players.find(p => p.username && p.username.toLowerCase() === username.toLowerCase());
                if (found) {
                    console.log(`\nFound in leaderboard: "${lb}"!`);
                    console.log(` - Matches: ${found.matches_played} | Points: ${found.points}`);
                    console.log(JSON.stringify(found, null, 2));
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
}
run();
