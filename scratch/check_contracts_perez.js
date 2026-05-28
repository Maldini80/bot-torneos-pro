import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const PLAYERS = ["Adrianbr03", "eric0055k", "Manelibz4_"];
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    console.log('=== VERIFICACIÓN DE CONTRATOS VPG ===\n');
    
    for (const name of PLAYERS) {
        const url = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(name)}/contracts/`;
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const contracts = await res.json();
                console.log(`Jugador: "${name}"`);
                console.log(`Contratos VPG (${contracts.length} encontrados):`);
                
                contracts.forEach((c, i) => {
                    console.log(`  ${i+1}. Club: "${c.team_name}" | Slug: "${c.team_slug}" | Status: ${c.status} | Joined: ${c.date_joined} | Left: ${c.date_left || 'N/A'}`);
                });
            } else {
                console.log(`Jugador: "${name}" | Error VPG API: ${res.status}`);
            }
        } catch (e) {
            console.error(`Error fetching contracts for ${name}:`, e.message);
        }
        console.log('------------------------------------------------------------\n');
    }
}

run();
