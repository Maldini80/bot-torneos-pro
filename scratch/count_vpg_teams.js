import dns from 'dns';
dns.setServers(['8.8.8.8']);

import { getDb } from '../database.js';
import { fetchVpgSpainLeagues } from '../src/utils/vpgCrawler.js';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    
    // Read active leagues from config
    let activeLeagues = [];
    const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
    if (config && Array.isArray(config.slugs)) {
        activeLeagues = config.slugs;
    } else {
        activeLeagues = ["superliga-spain-a", "superliga-spain-b", "segunda-division-a-spain", "segunda-division-b-spain", "tercera-division-a-spain", "tercera-division-b-spain", "cuarta-division-a-spain", "cuarta-division-b-spain", "quinta-division-a-spain", "quinta-division-b-spain"];
    }

    console.log(`Active leagues: ${activeLeagues.join(', ')}`);
    
    let totalVpgTeams = 0;
    for (const leagueSlug of activeLeagues) {
        const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/table/`;
        try {
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const data = await res.json();
                const standings = Array.isArray(data) ? data : (data.data || data.results || []);
                console.log(`- ${leagueSlug}: ${standings.length} teams in standings.`);
                totalVpgTeams += standings.length;
            } else {
                console.log(`- ${leagueSlug}: HTTP ${res.status}`);
            }
        } catch (e) {
            console.error(`- ${leagueSlug}: Error ${e.message}`);
        }
    }
    
    console.log(`\nTotal teams in VPG standings across active leagues: ${totalVpgTeams}`);
    await client.close();
}

main().catch(console.error);
