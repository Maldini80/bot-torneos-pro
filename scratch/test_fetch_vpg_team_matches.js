import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    console.log('=== BUSCANDO PARTIDOS DE OXYGEN LEVANTE EN VPG ===\n');
    const teamId = 36501; // ID de Oxygen Levante
    
    // Lista de posibles endpoints de partidos en la API de VPG
    const endpoints = [
        `https://api.virtualprogaming.com/public/teams/${teamId}/matches/`,
        `https://api.virtualprogaming.com/public/teams/${teamId}/results/`,
        `https://api.virtualprogaming.com/public/teams/${teamId}/fixtures/`
    ];
    
    for (const url of endpoints) {
        console.log(`Probando endpoint: ${url}`);
        try {
            const res = await fetch(url, { headers: HEADERS });
            console.log(`- Status: ${res.status}`);
            if (res.ok) {
                const data = await res.json();
                const results = data.data || data.results || data;
                console.log(`- Elementos devueltos: ${Array.isArray(results) ? results.length : 'Objeto'}`);
                if (Array.isArray(results) && results.length > 0) {
                    console.log('--- Muestra del primer partido ---');
                    console.log(JSON.stringify(results[0], null, 2));
                } else if (results && typeof results === 'object') {
                    console.log(JSON.stringify(results, null, 2).slice(0, 1000));
                }
            }
        } catch (e) {
            console.error(`- Error:`, e.message);
        }
        console.log('----------------------------------------------------');
    }
}
run();
