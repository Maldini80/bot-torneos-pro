import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEAGUES = [
    'superliga-spain-a',
    'superliga-spain-b',
    'segunda-division-a-spain',
    'segunda-division-b-spain',
    'tercera-division-a-spain',
    'tercera-division-b-spain',
    'cuarta-division-a-spain',
    'cuarta-division-b-spain',
    'quinta-division-a-spain',
    'quinta-division-b-spain',
    'quinta-division-c',
    'quinta-division-d'
];

const LEADERBOARDS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];

async function run() {
    const username = "zzRaydenzz";
    console.log(`Searching for ${username} across all VPG Spain divisions and leaderboards...`);
    
    for (const league of LEAGUES) {
        for (const lb of LEADERBOARDS) {
            const lbUrl = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${lb}&type=all&limit=250`;
            try {
                const lbRes = await fetch(lbUrl, { headers: HEADERS });
                if (lbRes.ok) {
                    const lbData = await lbRes.json();
                    const players = lbData.data || [];
                    const found = players.find(p => p.username && p.username.toLowerCase() === username.toLowerCase());
                    if (found) {
                        console.log(`\nFound in League: "${league}" | Leaderboard: "${lb}"!`);
                        console.log(` - Matches: ${found.matches_played} | Points: ${found.points}`);
                        console.log(JSON.stringify(found, null, 2));
                    }
                }
            } catch (e) {
                console.error(e.message);
            }
        }
    }
}
run();
