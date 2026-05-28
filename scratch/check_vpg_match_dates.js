import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const TEAMS = [
    { name: "Adrianbr03", slug: "rysix-gaming" },
    { name: "eric0055k", slug: "doom-reapers" },
    { name: "Manelibz4_", slug: "Hercules-CF-sports" }
];

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    console.log('=== ANÁLISIS DE FECHAS DE PARTIDOS VPG ===\n');
    
    for (const t of TEAMS) {
        console.log(`Club VPG: "${t.slug}" (Jugador: ${t.name})`);
        
        const url = `https://api.virtualprogaming.com/public/teams/${t.slug}/matches/?match_status=complete`;
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (!res.ok) {
                console.log(`  ❌ Error fetching matches from VPG API (status: ${res.status})`);
                continue;
            }
            const data = await res.json();
            const matches = Array.isArray(data) ? data : (data.data || data.results || []);
            
            console.log(`  - Partidos completados encontrados: ${matches.length}`);
            
            // Sort matches by datetime descending
            matches.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
            
            // Print recent 5 matches
            matches.slice(0, 5).forEach(m => {
                const matchDate = new Date(m.datetime);
                const madridStr = matchDate.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
                console.log(`    * [${madridStr}] J${m.match_day}: ${m.home_name} (${m.home_score}) vs ${m.away_name} (${m.away_score})`);
            });
            
        } catch (e) {
            console.error(`  ❌ Exception for ${t.slug}:`, e.message);
        }
        console.log('---------------------------------------------------\n');
    }
}

run();
