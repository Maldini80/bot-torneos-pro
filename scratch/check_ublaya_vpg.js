import axios from 'axios';

async function checkVpg(username) {
    try {
        console.log(`\n=== CONSULTANDO VPG PARA USUARIO: ${username} ===`);
        const infoUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/`;
        console.log(`GET ${infoUrl}`);
        const resInfo = await axios.get(infoUrl);
        console.log('PLAYER INFO:', JSON.stringify(resInfo.data, null, 2));

        const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
        console.log(`GET ${contractsUrl}`);
        const resContracts = await axios.get(contractsUrl);
        console.log('CONTRACTS:', JSON.stringify(resContracts.data, null, 2));
    } catch (e) {
        console.error(`Error al consultar ${username}:`, e.message);
    }
}

async function run() {
    await checkVpg('ublaya777');
    await checkVpg('ublaya');
    await checkVpg('Uriii-07-');
    await checkVpg('uriii');
}
run();
