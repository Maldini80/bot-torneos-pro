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

    // 1. Fetch player profile from DB
    const existingPlayer = await db.collection('player_profiles').findOne({ eaPlayerName: /zzraydenzz/i });
    console.log("existingPlayer in DB:", JSON.stringify(existingPlayer, null, 2));

    // 2. Fetch VPG leaderboard page containing Rayden
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
                console.log("\nFOUND RAYDEN at offset:", offset);
                console.log("Leaderboard record:", JSON.stringify(player, null, 2));
                
                const newVpgPoints = parseFloat(player.points) || 0;
                const pSlug = player.team_slug || '';
                const pSlugNormalized = String(pSlug).toLowerCase().trim();
                const dbSlugNormalized = String(existingPlayer.vpgTeamSlug || '').toLowerCase().trim();
                const hasTransferred = dbSlugNormalized && pSlugNormalized && dbSlugNormalized !== pSlugNormalized;

                const lastRaw = hasTransferred ? {} : (existingPlayer.stats?.vpgLastRaw || existingPlayer.stats || {});
                const delta = Math.max(0, Math.round((newVpgPoints - (parseFloat(lastRaw.vpgPoints) || 0)) * 10) / 10);
                
                console.log("\nCalculation details:");
                console.log("hasTransferred:", hasTransferred);
                console.log("lastRaw.vpgPoints:", lastRaw.vpgPoints);
                console.log("newVpgPoints:", newVpgPoints);
                console.log("Calculated Delta:", delta);
                break;
            }
            if (players.length < 30) hasMore = false;
        } else {
            console.error("HTTP error:", res.status);
            break;
        }
        offset += 30;
        if (offset >= 1200) break;
    }


    await client.close();
}

test().catch(console.error);
