import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARDS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];

async function run() {
    const leagueSlug = "superliga-spain-a";
    console.log(`=== BUSCANDO JUGADORES DE JAM ESPORTS (JAM-ES) EN LEADERBOARDS DE VPG ===`);
    
    let totalFound = 0;
    
    for (const lb of LEADERBOARDS) {
        let offset = 0;
        let hasMore = true;
        let lbCount = 0;
        
        while (hasMore) {
            const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${lb}&type=all&limit=50&offset=${offset}`;
            try {
                const res = await fetch(url, { headers: HEADERS });
                if (res.ok) {
                    const data = await res.json();
                    const players = data.data || [];
                    if (players.length === 0) {
                        hasMore = false;
                        break;
                    }
                    
                    const jamPlayers = players.filter(p => 
                        (p.team_slug && p.team_slug.toLowerCase() === 'jam-es') ||
                        (p.team_name && p.team_name.toLowerCase().includes('jam'))
                    );
                    
                    if (jamPlayers.length > 0) {
                        jamPlayers.forEach(p => {
                            totalFound++;
                            console.log(`Leaderboard: [${lb}] | Jugador: ${p.username} | Puntos: ${p.points} | Partidos: ${p.matches_played} | Club: ${p.team_name} (Slug: ${p.team_slug})`);
                        });
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
    console.log(`\nBúsqueda completada. Encontrados ${totalFound} jugadores de JAM ESPORTS en total.`);
}
run();
