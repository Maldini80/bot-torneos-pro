import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARD_POSITIONS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];

async function run() {
    console.log('=== CONSULTANDO API DE VPG PARA xDoku_11 ===\n');
    const leagueSlug = 'superliga-spain-b';
    const targetPlayer = 'xdoku_11';
    
    let found = false;
    
    for (const pos of LEADERBOARD_POSITIONS) {
        console.log(`Buscando en leaderboard: ${pos}...`);
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
            const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${pos}&type=all&limit=30&offset=${offset}`;
            try {
                const res = await fetch(url, { headers: HEADERS });
                if (!res.ok) {
                    console.log(`   Error en API (${res.status})`);
                    break;
                }
                const data = await res.json();
                const players = data.data || [];
                
                if (players.length === 0) {
                    hasMore = false;
                    break;
                }
                
                const match = players.find(p => p.player_name?.toLowerCase().includes('doku'));
                if (match) {
                    console.log(`\n🎉 ¡COINCIDENCIA PARCIAL ENCONTRADA en ${pos}!`);
                    console.log(JSON.stringify(match, null, 2));
                    found = true;
                }
                
                if (players.length < 30) {
                    hasMore = false;
                } else {
                    offset += 30;
                }
            } catch (e) {
                console.error(`Error de red:`, e.message);
                break;
            }
        }
        if (found) break;
    }
    
    if (!found) {
        console.log(`\n❌ El jugador "${targetPlayer}" no fue devuelto por la API de VPG en ninguna clasificación de la liga ${leagueSlug}.`);
    }
}
run();
