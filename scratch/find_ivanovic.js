import { MongoClient } from 'mongodb';
import 'dotenv/config';
import fetch from 'node-fetch';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

const LEADERBOARD_POS_MAP = {
    'top_gk': 'POR',
    'top_cb': 'DFC',
    'top_fb': 'CARR',
    'top_cdm': 'MC',
    'top_cam': 'MC',
    'top_wingers': 'CARR',
    'top_strikers': 'DC'
};

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    console.log("--- DATABASE PLAYER PROFILE ---");
    const p = await db.collection('player_profiles').findOne({ 
        eaPlayerName: /ivanovic57/i
    });
    console.log(JSON.stringify(p, null, 2));

    console.log("\n--- SEARCHING VPG LEADERBOARDS ---");
    const activeLeagues = ["superliga-spain-a", "superliga-spain-b", "segunda-division-a-spain", "segunda-division-b-spain"];
    
    for (const league of activeLeagues) {
        for (const [vpgPosKey, fantasyPos] of Object.entries(LEADERBOARD_POS_MAP)) {
            let offset = 0;
            let hasMore = true;
            while (hasMore) {
                const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${vpgPosKey}&type=all&limit=30&offset=${offset}`;
                const res = await fetch(url, { headers: HEADERS });
                if (!res.ok) break;
                const data = await res.json();
                const players = data.data || [];
                if (players.length < 30) hasMore = false;
                
                const found = players.find(x => x.username && x.username.toLowerCase() === 'ivanovic57');
                if (found) {
                    console.log(`Found in League: "${league}" | Position Board: "${vpgPosKey}" (offset: ${offset})`);
                    console.log(JSON.stringify(found, null, 2));
                }
                
                offset += 30;
                if (offset >= 300) break;
            }
        }
    }
    
    await client.close();
}

main().catch(console.error);
