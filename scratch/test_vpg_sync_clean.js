import dns from 'dns';
dns.setServers(['8.8.8.8']); // Use Google DNS for resolving Mongo SRV

import { connectDb } from '../database.js';
import { syncFantasyWithVpg } from '../src/utils/fantasyVpgSync.js';

async function main() {
    console.log("Connecting to database...");
    await connectDb();
    
    console.log("Starting Fantasy VPG sync with old player cleanup...");
    // Let's run the sync
    await syncFantasyWithVpg();
    
    console.log("Sync test finished successfully!");
    process.exit(0);
}

main().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
