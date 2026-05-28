import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

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
    console.log(`=== INICIANDO BÚSQUEDA GLOBAL DE ${username} EN TODAS LAS DIVISIONES DE VPG ESPAÑA (LIMIT 50) ===`);
    
    let foundAny = false;
    
    for (const league of LEAGUES) {
        for (const lb of LEADERBOARDS) {
            let offset = 0;
            let hasMore = true;
            
            while (hasMore) {
                const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${lb}&type=all&limit=50&offset=${offset}`;
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
                            console.log(`\n🎉 ¡ENCONTRADO!`);
                            console.log(` - Liga VPG: ${league}`);
                            console.log(` - Clasificación: ${lb}`);
                            console.log(` - Club: ${found.team_name} (Slug: ${found.team_slug})`);
                            console.log(` - Partidos jugados: ${found.matches_played}`);
                            console.log(` - Puntos: ${found.points}`);
                            console.log(JSON.stringify(found, null, 2));
                            foundAny = true;
                            return; // Stop searching once found
                        }
                        
                        if (players.length < 50) {
                            hasMore = false;
                        }
                    } else {
                        hasMore = false;
                    }
                } catch (e) {
                    hasMore = false;
                }
                offset += 50;
                if (offset >= 1000) hasMore = false;
            }
        }
    }
    
    if (!foundAny) {
        console.log(`\n❌ zzRaydenzz no fue encontrado en ninguna de las clasificaciones de ninguna división de VPG España.`);
    }
}
run();
