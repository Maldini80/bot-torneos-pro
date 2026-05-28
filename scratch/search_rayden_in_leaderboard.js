import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARD_POS_MAP = {
    'top_gk': 'POR',
    'top_cb': 'DFC',
    'top_fb': 'CARR',
    'top_cdm': 'MC',
    'top_cam': 'MC',
    'top_wingers': 'CARR',
    'top_strikers': 'DC'
};

async function run() {
    const leagueSlug = "superliga-spain-a";
    const username = "zzRaydenzz";
    
    console.log(`Checking ALL leaderboards in ${leagueSlug} for ${username}...`);
    
    for (const [vpgPosKey, fantasyPos] of Object.entries(LEADERBOARD_POS_MAP)) {
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
            const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&type=all&limit=50&offset=${offset}`;
            try {
                const res = await fetch(url, { headers: HEADERS });
                if (res.ok) {
                    const data = await res.json();
                    const players = data.data || [];
                    if (players.length === 0) {
                        hasMore = false;
                        break;
                    }
                    
                    const found = players.find(p => p.username && p.username.toLowerCase() === username.toLowerCase());
                    if (found) {
                        console.log(`\n🎉 ENCONTRADO en leaderboard '${vpgPosKey}':`);
                        console.log(JSON.stringify(found, null, 2));
                        return;
                    }
                    
                    if (players.length < 50) {
                        hasMore = false;
                    }
                } else {
                    console.log(`Failed for ${vpgPosKey}: HTTP ${res.status}`);
                    hasMore = false;
                }
            } catch (e) {
                console.log(`Error for ${vpgPosKey}: ${e.message}`);
                hasMore = false;
            }
            offset += 50;
            if (offset >= 1000) hasMore = false;
        }
    }
    console.log(`\n❌ zzRaydenzz no fue encontrado en ninguna de las clasificaciones de la liga ${leagueSlug}.`);
}
run();
