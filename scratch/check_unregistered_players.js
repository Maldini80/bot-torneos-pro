import dns from 'dns';
dns.setServers(['8.8.8.8']); // Use Google DNS to avoid SRV resolution issues

import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function test() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');
    const playerColl = db.collection('player_profiles');
    
    const unregisteredClubs = [
        "PALANQUISTA ESPORTS",
        "CORDOBA LEGENDS",
        "GENIOS UNIDOS",
        "ATHLETIC UNITED",
        "REVOLUTION ESPORTS",
        "BAT QUEENS"
    ];
    
    console.log("Checking database for players from unregistered teams:");
    for (const clubName of unregisteredClubs) {
        const query = { lastClub: { $regex: new RegExp(clubName, 'i') } };
        const count = await playerColl.countDocuments(query);
        console.log(`- "${clubName}": found ${count} players in DB.`);
        if (count > 0) {
            const samples = await playerColl.find(query).limit(2).toArray();
            console.log(`  Samples:`, samples.map(p => `${p.eaPlayerName} (Pos: ${p.lastPosition}, Wins: ${p.stats.wins}, Losses: ${p.stats.losses})`).join(', '));
        }
    }
    await client.close();
}

test().catch(console.error);
