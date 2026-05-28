import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import fs from 'fs';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

async function run() {
    const url = 'https://virtualprogaming.com/profile/zzRaydenzz';
    console.log(`=== FETCHING PUBLIC PROFILE HTML: ${url} ===`);
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const html = await res.text();
            console.log("HTML length:", html.length);
            
            // Let's search for points, matches played, or any stats table
            // Look for patterns like "Points", "Matches", "Goals", "Assists", etc.
            console.log("\nSearching for match counts and stats in HTML...");
            
            // Regex to find stats
            const matchesRegex = /<div[^>]*>Partidos<\/div>[\s\S]*?<div[^>]*>(\d+)<\/div>/i;
            const pointsRegex = /<div[^>]*>Puntos<\/div>[\s\S]*?<div[^>]*>([\d.]+)<\/div>/i;
            
            // Let's print snippets containing matches/points or stats
            const lines = html.split('\n');
            let found = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('points') || line.includes('matches') || line.includes('Partidos') || line.includes('Puntos') || line.includes('75.') || line.includes('19.')) {
                    console.log(`Line ${i}: ${line.trim().substring(0, 200)}`);
                    found++;
                    if (found > 30) break;
                }
            }
            
            // Save a snippet to check
            fs.writeFileSync('scratch/rayden_profile.html', html, 'utf-8');
            console.log("\nSaved full HTML to scratch/rayden_profile.html");
        } else {
            console.log(`Failed to fetch: HTTP ${res.status}`);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
