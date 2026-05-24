// scratch/test_90min.js
import { fetchFromVpg } from '../src/utils/vpgCrawler.js';

async function main() {
    try {
        console.log('Fetching contracts for 90min...');
        const contracts = await fetchFromVpg('teams/90min/contracts');
        console.log(`Total contracts fetched: ${contracts.length}`);
        
        contracts.forEach((c, idx) => {
            console.log(`[${idx}] Username: ${c.username}, Community ID: ${c.community_id}, League ID: ${c.league_id}, Position: ${c.position}, Status: ${c.status}`);
        });
    } catch (e) {
        console.error('Error fetching contracts:', e);
    }
}

main();
