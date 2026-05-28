import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const league = 'superliga-spain-a';
    const lb = 'top_cb';
    let offset = 0;
    let hasMore = true;
    const allMatches = [];
    
    while (hasMore) {
        const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${lb}&type=all&limit=100&offset=${offset}`;
        console.log(`Fetching ${url}...`);
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const data = await res.json();
                const players = data.data || [];
                console.log(`Page (offset: ${offset}): Found ${players.length} players.`);
                
                if (players.length === 0) {
                    hasMore = false;
                } else {
                    const matches = players.filter(p => {
                        const username = (p.username || '').toLowerCase();
                        return username.includes('rayden');
                    });
                    allMatches.push(...matches);
                    
                    if (players.length < 30) {
                        hasMore = false;
                    } else {
                        offset += 30;
                    }
                }
            } else {
                console.log(`Failed: HTTP ${res.status}`);
                hasMore = false;
            }
        } catch (e) {
            console.error(e);
            hasMore = false;
        }
    }
    
    console.log("\nMatching players in CB leaderboard (all pages):");
    console.log(JSON.stringify(allMatches, null, 2));
}

run();
