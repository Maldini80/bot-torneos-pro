import { MongoClient } from 'mongodb';
import 'dotenv/config';

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function test() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');

    const existingPlayer = await db.collection('player_profiles').findOne({ eaPlayerName: /zzraydenzz/i });
    console.log("DB Stats:", existingPlayer.stats);

    const leagueSlug = 'superliga-spain-a';
    const vpgPosKey = 'top_cb';
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const url = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=${vpgPosKey}&type=all&limit=30&offset=${offset}`;
        const res = await fetch(url, { headers: HEADERS });
        if (res.ok) {
            const data = await res.json();
            const players = data.data || [];
            const player = players.find(p => p.username && p.username.toLowerCase() === 'zzraydenzz');
            if (player) {
                console.log("\nFOUND RAYDEN!");
                console.log("Crawled Points from VPG API:", player.points);
                console.log("Crawled Matches from VPG API:", player.matches_played);
                
                const newVpgPoints = parseFloat(player.points) || 0;
                const lastRaw = existingPlayer.stats?.vpgLastRaw || existingPlayer.stats || {};
                console.log("lastRaw.vpgPoints:", lastRaw.vpgPoints);
                
                const delta = Math.max(0, Math.round((newVpgPoints - (parseFloat(lastRaw.vpgPoints) || 0)) * 10) / 10);
                console.log("Calculated delta:", delta);
                break;
            }
            if (players.length < 30) hasMore = false;
        } else {
            hasMore = false;
        }
        offset += 30;
        if (offset >= 1200) break;
    }

    await client.close();
}

test().catch(console.error);
