import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function checkUser(username) {
    const url = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/`;
    console.log(`Buscando usuario: ${username}...`);
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log(`- Status: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            console.log('--- Perfil Encontrado ---');
            console.log(`ID: ${data.id}`);
            console.log(`Username: ${data.username}`);
            console.log(`Given Name: ${data.given_name}`);
            console.log(`Family Name: ${data.family_name}`);
            console.log(`Position: ${data.position}`);
            console.log(`PSN: ${data.psn}`);
            console.log(`Origin: ${data.origin}`);
            return data;
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    return null;
}

async function run() {
    console.log('=== VERIFICANDO PERFILES DE USUARIOS EN VPG ===\n');
    await checkUser('xDoku_11');
    console.log('----------------------------------------------------');
    await checkUser('xRubenPrieto-_-');
    console.log('----------------------------------------------------');
    await checkUser('xRubenPrieto');
    console.log('----------------------------------------------------');
}
run();
