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
    console.log(`Searching all leaderboards for players of JAM ESPORTS...`);
    
    for (const lb of LEADERBOARDS) {
        const lbUrl = `https://api.virtualprogaming.com/public/leagues/superliga-spain-a/leaderboard?leaderboard=${lb}&type=all&limit=250`;
        try {
            const lbRes = await fetch(lbUrl, { headers: HEADERS });
            if (lbRes.ok) {
                const lbData = await lbRes.json();
                const players = lbData.data || [];
                const jamPlayers = players.filter(p => p.team_name && p.team_name.toLowerCase().includes('jam'));
                if (jamPlayers.length > 0) {
                    console.log(`\n=== Leaderboard: "${lb}" ===`);
                    jamPlayers.forEach(p => {
                        console.log(` - Player: ${p.username} | Matches: ${p.matches_played} | Points: ${p.points}`);
                    });
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
}
run();
