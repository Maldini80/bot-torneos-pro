import { MongoClient } from 'mongodb';
import 'dotenv/config';

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

async function test() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');

    const existingPlayer = await db.collection('player_profiles').findOne({ eaPlayerName: /zzraydenzz/i });
    console.log("DB profile stats:", existingPlayer.stats);

    const activeLeagues = ["superliga-spain-a", "superliga-spain-b", "segunda-division-a-spain", "segunda-division-b-spain", "tercera-division-a-spain", "tercera-division-b-spain", "cuarta-division-a-spain", "cuarta-division-b-spain", "quinta-division-a-spain", "quinta-division-b-spain", "quinta-division-c", "quinta-division-d"];

    for (const leagueSlug of activeLeagues) {
        for (const [vpgPosKey, fantasyPos] of Object.entries(LEADERBOARD_POS_MAP)) {
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
                        console.log(`\nFound Rayden on League: ${leagueSlug} | Leaderboard: ${vpgPosKey}`);
                        console.log("Leaderboard points:", player.points);
                        console.log("Leaderboard matches:", player.matches_played);
                        
                        const newVpgPoints = parseFloat(player.points) || 0;
                        const pSlug = player.team_slug || '';
                        const pSlugNormalized = String(pSlug).toLowerCase().trim();
                        const dbSlugNormalized = String(existingPlayer.vpgTeamSlug || '').toLowerCase().trim();
                        const hasTransferred = dbSlugNormalized && pSlugNormalized && dbSlugNormalized !== pSlugNormalized;

                        const lastRaw = hasTransferred ? {} : (existingPlayer.stats?.vpgLastRaw || existingPlayer.stats || {});
                        const delta = Math.max(0, Math.round((newVpgPoints - (parseFloat(lastRaw.vpgPoints) || 0)) * 10) / 10);
                        
                        console.log("hasTransferred:", hasTransferred);
                        console.log("lastRaw.vpgPoints:", lastRaw.vpgPoints);
                        console.log("Calculated Delta:", delta);
                    }
                    if (players.length < 30) hasMore = false;
                } else {
                    hasMore = false;
                }
                offset += 30;
                if (offset >= 1200) break;
            }
        }
    }

    await client.close();
}

test().catch(console.error);
