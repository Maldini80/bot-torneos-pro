import axios from 'axios';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    try {
        const activeLeagues = [
            "superliga-spain-a", "superliga-spain-b", 
            "segunda-division-a-spain", "segunda-division-b-spain", 
            "tercera-division-a-spain", "tercera-division-b-spain", 
            "cuarta-division-a-spain", "cuarta-division-b-spain", 
            "quinta-division-a-spain", "quinta-division-b-spain", 
            "quinta-division-c-spain", "quinta-division-d-spain"
        ];
        const posKeys = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
        
        console.log(`--- BUSCANDO EN TODAS LAS LIGAS ACTIVAS ---`);
        for (const leagueSlug of activeLeagues) {
            for (const pos of posKeys) {
                let offset = 0;
                let found = false;
                while (offset < 100) {
                    const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${pos}&type=all&limit=50&offset=${offset}`;
                    try {
                        const res = await axios.get(url, { headers: HEADERS });
                        const players = res.data?.data || [];
                        if (players.length === 0) break;
                        
                        const match = players.find(p => p.username?.toLowerCase().includes('ublaya') || p.username?.toLowerCase().includes('uriii'));
                        if (match) {
                            console.log(`\nENCONTRADO en ${leagueSlug} pos "${pos}":`);
                            console.log(JSON.stringify(match, null, 2));
                            found = true;
                            break;
                        }
                    } catch (err) {
                        // Omitir error de división vacía o error 422/404
                    }
                    offset += 50;
                }
                if (found) break;
            }
        }
    } catch (e) {
        console.error(e.message);
    }
}
run();
