import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const league = 'superliga-spain-b';
    const leaderboards = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
    const types = ['all', 'weekly'];
    
    for (const lb of leaderboards) {
        for (const type of types) {
            const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${lb}&type=${type}&limit=250&offset=0`;
            console.log(`Fetching ${url}...`);
            try {
                const res = await fetch(url, { headers: HEADERS });
                if (res.ok) {
                    const data = await res.json();
                    const players = data.data || [];
                    const matches = players.filter(p => {
                        const username = (p.username || '').toLowerCase();
                        return username.includes('rayden');
                    });
                    if (matches.length > 0) {
                        console.log(`Found matching players in ${lb} (${type}):`);
                        console.log(JSON.stringify(matches, null, 2));
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
    }
}

run();
