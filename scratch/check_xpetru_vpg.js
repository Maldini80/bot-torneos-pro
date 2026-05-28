import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    await connectDb();
    const db = getDb();
    
    // 1. Fetch user contracts from VPG API
    const username = 'xpetruu';
    const HEADERS = {
        'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
        'Accept': 'application/json',
    };
    
    console.log(`Checking contracts on VPG API for ${username}...`);
    try {
        const res = await fetch(`https://api.virtualprogaming.com/public/users/${encodeURIComponent(username)}/contracts/`, { headers: HEADERS });
        if (res.ok) {
            const contracts = await res.json();
            console.log('Contracts found on VPG:', JSON.stringify(contracts, null, 2));
        } else {
            console.log('Error fetching contracts:', res.status);
        }
    } catch (e) {
        console.error(e);
    }
    
    // 2. Let's see if xpetruu was modified or updated in any way recently
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: "xpetruu" });
    console.log('\nPlayer document in database:', JSON.stringify(player, null, 2));

    process.exit(0);
}

run();
