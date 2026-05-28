import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    // 1. Obtener todos los jugadores con vpgLeagueSlug en superliga
    const allPlayers = await db.collection('player_profiles').find({
        vpgLeagueSlug: { $in: ['superliga-spain-a', 'superliga-spain-b'] }
    }, {
        projection: { eaPlayerName: 1, vpgLeagueSlug: 1, vpgTeamSlug: 1, 'stats.vpgPoints': 1, 'stats.matchesPlayed': 1, 'stats.vpgLastRaw': 1 }
    }).toArray();
    
    console.log(`Total jugadores en superligas: ${allPlayers.length}`);
    
    // 2. Obtener leaderboards completos de ambas ligas
    const leagueData = {};
    for (const league of ['superliga-spain-a', 'superliga-spain-b']) {
        leagueData[league] = {};
        const positions = ['top_strikers', 'top_cam', 'top_wingers', 'top_cdm', 'top_cb', 'top_fb', 'top_gk'];
        for (const pos of positions) {
            let offset = 0;
            while (offset < 600) {
                try {
                    const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${pos}&type=all&limit=30&offset=${offset}`;
                    const res = await fetch(url, { headers: HEADERS });
                    if (!res.ok) break;
                    const data = await res.json();
                    const players = data.data || [];
                    if (players.length === 0) break;
                    for (const p of players) {
                        if (!p.username) continue;
                        const key = p.username.toLowerCase();
                        if (!leagueData[league][key]) {
                            leagueData[league][key] = {
                                username: p.username,
                                team: p.team_name,
                                slug: p.team_slug,
                                points: parseFloat(p.points) || 0,
                                pj: p.matches_played || 0,
                                goals: parseInt(p.goals) || 0,
                                assists: parseInt(p.assists) || 0,
                                pos: pos
                            };
                        } else {
                            // Sumar si aparece en otra posición
                            leagueData[league][key].points += (parseFloat(p.points) || 0);
                            leagueData[league][key].pj += (p.matches_played || 0);
                            leagueData[league][key].goals += (parseInt(p.goals) || 0);
                            leagueData[league][key].assists += (parseInt(p.assists) || 0);
                        }
                    }
                    if (players.length < 30) break;
                } catch (e) { break; }
                offset += 30;
            }
        }
        console.log(`Leaderboard ${league}: ${Object.keys(leagueData[league]).length} jugadores`);
    }
    
    // 3. Encontrar jugadores que están en AMBAS ligas
    const dualLeaguePlayers = [];
    const playersA = Object.keys(leagueData['superliga-spain-a']);
    const playersB = new Set(Object.keys(leagueData['superliga-spain-b']));
    
    for (const name of playersA) {
        if (playersB.has(name)) {
            const a = leagueData['superliga-spain-a'][name];
            const b = leagueData['superliga-spain-b'][name];
            const realTotal = a.points + b.points;
            const realPJ = a.pj + b.pj;
            
            // Buscar en DB
            const dbPlayer = allPlayers.find(p => p.eaPlayerName.toLowerCase() === name);
            const dbPts = dbPlayer ? (dbPlayer.stats?.vpgPoints || 0) : 0;
            const dbPJ = dbPlayer ? (dbPlayer.stats?.matchesPlayed || 0) : 0;
            
            dualLeaguePlayers.push({
                name: a.username,
                teamA: a.team,
                ptsA: a.points,
                pjA: a.pj,
                teamB: b.team,
                ptsB: b.points,
                pjB: b.pj,
                realTotal,
                realPJ,
                dbPts,
                dbPJ,
                inflated: dbPts > realTotal * 1.3,
                ratio: dbPts > 0 ? (dbPts / realTotal).toFixed(2) : 'N/A'
            });
        }
    }
    
    console.log(`\n=== JUGADORES EN AMBAS LIGAS (superliga-spain-a Y superliga-spain-b) ===`);
    console.log(`Total: ${dualLeaguePlayers.length}\n`);
    
    for (const p of dualLeaguePlayers) {
        const status = p.inflated ? '🔴 INFLADO' : '✅ OK';
        console.log(`${status} ${p.name}:`);
        console.log(`   Liga-A: ${p.teamA} (${p.ptsA} pts, ${p.pjA} PJ)`);
        console.log(`   Liga-B: ${p.teamB} (${p.ptsB} pts, ${p.pjB} PJ)`);
        console.log(`   Real: ${p.realTotal} pts, ${p.realPJ} PJ`);
        console.log(`   DB:   ${p.dbPts} pts, ${p.dbPJ} PJ (x${p.ratio})`);
        console.log('');
    }
    
    // 4. También buscar en ligas inferiores (segunda, tercera, etc.)
    const lowerLeagues = [];
    try {
        const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
        if (config && Array.isArray(config.slugs)) {
            for (const slug of config.slugs) {
                if (!slug.startsWith('superliga-spain')) {
                    lowerLeagues.push(slug);
                }
            }
        }
    } catch (e) {}
    
    if (lowerLeagues.length > 0) {
        console.log(`\n=== Comprobando ligas inferiores: ${lowerLeagues.join(', ')} ===`);
        for (const league of lowerLeagues) {
            const positions = ['top_strikers', 'top_cam', 'top_wingers', 'top_cdm', 'top_cb', 'top_fb', 'top_gk'];
            const lowerPlayers = {};
            for (const pos of positions) {
                let offset = 0;
                while (offset < 300) {
                    try {
                        const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${pos}&type=all&limit=30&offset=${offset}`;
                        const res = await fetch(url, { headers: HEADERS });
                        if (!res.ok) break;
                        const data = await res.json();
                        const players = data.data || [];
                        if (players.length === 0) break;
                        for (const p of players) {
                            if (!p.username) continue;
                            const key = p.username.toLowerCase();
                            if (!lowerPlayers[key]) {
                                lowerPlayers[key] = { username: p.username, points: parseFloat(p.points) || 0, pj: p.matches_played || 0, team: p.team_name };
                            }
                        }
                        if (players.length < 30) break;
                    } catch (e) { break; }
                    offset += 30;
                }
            }
            
            // Cruzar con leaderboards de superligas
            for (const [name, data] of Object.entries(lowerPlayers)) {
                const inA = leagueData['superliga-spain-a'][name];
                const inB = leagueData['superliga-spain-b'][name];
                if (inA || inB) {
                    const superPts = (inA ? inA.points : 0) + (inB ? inB.points : 0);
                    console.log(`⚠️ ${data.username}: También en ${league} (${data.team}, ${data.points} pts) + Superliga (${superPts} pts)`);
                }
            }
        }
    }
    
    await client.close();
}

main().catch(console.error);
