import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const leagueSlug = "superliga-spain-a";
    const username = "zzRaydenzz";
    
    console.log(`=== BUSCANDO A ${username} CON PAGINACIÓN CORREGIDA EN ${leagueSlug} ===`);
    
    const lbs = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
    
    for (const lb of lbs) {
        let offset = 0;
        let hasMore = true;
        let totalProcessed = 0;
        
        while (hasMore) {
            const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${lb}&type=all&limit=30&offset=${offset}`;
            try {
                const res = await fetch(url, { headers: HEADERS });
                if (res.ok) {
                    const data = await res.json();
                    const players = data.data || [];
                    if (players.length === 0) {
                        hasMore = false;
                        break;
                    }
                    
                    totalProcessed += players.length;
                    
                    const found = players.find(p => p.username && p.username.toLowerCase() === username.toLowerCase());
                    if (found) {
                        console.log(`\n🎉 ¡ENCONTRADO EN VPG EN EL LEADERBOARD '${lb}'!`);
                        console.log(JSON.stringify(found, null, 2));
                        return;
                    }
                    
                    // Increment offset by the actual number of players received
                    offset += players.length;
                } else {
                    console.log(`Error en ${lb} (offset ${offset}): HTTP ${res.status}`);
                    hasMore = false;
                }
            } catch (e) {
                console.error(`Excepción en ${lb}:`, e.message);
                hasMore = false;
            }
            
            // Safety limit
            if (offset >= 1500) hasMore = false;
        }
        console.log(`Leaderboard ${lb}: procesados ${totalProcessed} jugadores.`);
    }
    console.log("\n❌ No se encontró a zzRaydenzz tras buscar en todos los leaderboards.");
}
run();
