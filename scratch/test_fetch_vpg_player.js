import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    console.log('=== CONSULTANDO DETALLES DE JUGADOR EN VPG ===\n');
    const username = 'panzerkh11';
    
    // 1. Fetch user general profile
    const url = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/`;
    console.log(`URL: ${url}`);
    
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            console.log('--- Datos de Perfil de VPG ---');
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log(`Error al obtener perfil: ${res.status}`);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    
    // 2. Fetch contracts
    const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
    console.log(`\nURL Contratos: ${contractsUrl}`);
    try {
        const res = await fetch(contractsUrl, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            console.log('--- Contratos de VPG ---');
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log(`Error al obtener contratos: ${res.status}`);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}
run();
