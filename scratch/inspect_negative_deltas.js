import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const LEADERBOARDS = ['top_gk', 'top_cb', 'top_fb', 'top_cdm', 'top_cam', 'top_wingers', 'top_strikers'];
const LEAGUES = [
    'superliga-spain-a', 'superliga-spain-b', 'segunda-division-a-spain', 'segunda-division-b-spain',
    'tercera-division-a-spain', 'tercera-division-b-spain', 'cuarta-division-a-spain', 'cuarta-division-b-spain',
    'quinta-division-a-spain', 'quinta-division-b-spain', 'quinta-division-c', 'quinta-division-d'
];
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== BUSCANDO JUGADORES CON VPG LIVE < DB Y BASELINE DESALINEADO ===\n');
        
        // Fetch all players from VPG live
        console.log('Fetching live VPG leaderboards...');
        const vpgPlayers = new Map();
        
        for (const league of LEAGUES) {
            for (const lb of LEADERBOARDS) {
                let offset = 0;
                let hasMore = true;
                while (hasMore) {
                    const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${lb}&type=all&limit=30&offset=${offset}`;
                    try {
                        const res = await fetch(url, { headers: HEADERS });
                        if (res.ok) {
                            const data = await res.json();
                            const players = data.data || [];
                            if (players.length === 0) {
                                hasMore = false;
                            } else {
                                for (const p of players) {
                                    if (p.username) {
                                        const usernameLower = p.username.toLowerCase();
                                        if (!vpgPlayers.has(usernameLower)) {
                                            vpgPlayers.set(usernameLower, {
                                                username: p.username,
                                                points: parseFloat(p.points) || 0,
                                                matches: parseInt(p.matches_played) || 0,
                                                teamSlug: p.team_slug,
                                                teamName: p.team_name,
                                                league: league
                                            });
                                        }
                                    }
                                }
                                if (players.length < 30) hasMore = false;
                                else offset += 30;
                            }
                        } else {
                            hasMore = false;
                        }
                    } catch (e) {
                        hasMore = false;
                    }
                }
            }
        }
        
        console.log(`Live VPG data fetched: ${vpgPlayers.size} players.\n`);
        
        const playerColl = db.collection('player_profiles');
        const dbPlayers = await playerColl.find({ excluded: { $ne: true } }).toArray();
        
        const report = [];
        
        for (const p of dbPlayers) {
            if (!p.eaPlayerName) continue;
            const nameLower = p.eaPlayerName.toLowerCase();
            const live = vpgPlayers.get(nameLower);
            
            if (!live) continue; // Not active or not on Spain leaderboards
            
            const dbPoints = p.stats?.vpgPoints || 0;
            const lastRawPoints = parseFloat(p.stats?.vpgLastRaw?.vpgPoints) || 0;
            
            // Check if live points are lower than DB points by more than 1
            if (live.points < dbPoints - 1) {
                // Check if lastRaw is missing or not aligned with live points
                if (!p.stats?.vpgLastRaw || Math.abs(lastRawPoints - live.points) > 0.5) {
                    report.push({
                        username: p.eaPlayerName,
                        dbPoints,
                        livePoints: live.points,
                        liveMatches: live.matches,
                        lastRawPoints,
                        vpgTeamSlug: live.teamSlug,
                        vpgLeagueSlug: live.league,
                        lastClub: live.teamName
                    });
                }
            }
        }
        
        console.log(`Encontrados ${report.length} jugadores con anomalías de baseline (VPG Live < DB y vpgLastRaw desalineado):\n`);
        
        report.forEach((item, index) => {
            console.log(`${index + 1}. Jugador: "${item.username}"`);
            console.log(`   - Puntos DB: ${item.dbPoints} pts`);
            console.log(`   - Puntos VPG Live: ${item.livePoints} pts (${item.liveMatches} PJ)`);
            console.log(`   - vpgLastRaw actual en DB: ${item.lastRawPoints} pts`);
            console.log(`   - Club Activo VPG: "${item.lastClub}" (slug: ${item.vpgTeamSlug}) en ${item.vpgLeagueSlug}`);
            console.log('------------------------------------------------------------');
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
