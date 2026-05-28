import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    console.log('=== CONSULTANDO DETALLES DEL PARTIDO VPG 1580359 ===\n');
    
    // Lista de posibles endpoints para detalles de partidos
    const urls = [
        `https://api.virtualprogaming.com/public/matches/1580359`,
        `https://api.virtualprogaming.com/public/matches/1580359/`,
        `https://api.virtualprogaming.com/public/matches/1580359/players/`
    ];
    
    for (const url of urls) {
        console.log(`Probando endpoint: ${url}`);
        try {
            const res = await fetch(url, { headers: HEADERS });
            console.log(`- Status: ${res.status}`);
            if (res.ok) {
                const data = await res.json();
                console.log(JSON.stringify(data, null, 2).slice(0, 3000));
            }
        } catch (e) {
            console.error(`- Error:`, e.message);
        }
        console.log('----------------------------------------------------');
    }
}
run();
