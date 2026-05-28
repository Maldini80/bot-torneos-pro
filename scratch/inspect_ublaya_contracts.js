import axios from 'axios';

async function run() {
    try {
        const username = 'ublaya777';
        const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`;
        const resContracts = await axios.get(contractsUrl);
        const contracts = resContracts.data || [];
        console.log(`Total contratos en VPG para ${username}: ${contracts.length}`);
        
        for (const c of contracts) {
            console.log(`ID: ${c.id} | Club: ${c.team_name} (${c.team_slug}) | Status: ${c.status} | Community ID: ${c.community_id} | League ID: ${c.league_id}`);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
