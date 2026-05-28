import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const PLAYERS = [
    "SGY_Raynor", "slipgord", "Adrianbr03", "Is_White_M4mb4", "eric0055k",
    "fRanUDLP", "KING_isla33-YT", "dariogallardo", "Manelibz4_", "alvaroriveiroP",
    "JoseGipsy77"
];

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
        
        console.log('=== VERIFICACIÓN DETALLADA DE JUGADORES DE PEREZ FC ===\n');
        
        // 1. Fetch live VPG stats for these players
        console.log('Fetching live VPG stats...');
        const vpgStatsMap = new Map();
        
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
                                    const username = p.username;
                                    if (username && PLAYERS.some(name => name.toLowerCase() === username.toLowerCase())) {
                                        vpgStatsMap.set(username.toLowerCase(), {
                                            points: parseFloat(p.points) || 0,
                                            matches: parseInt(p.matches_played) || 0,
                                            teamName: p.team_name,
                                            teamSlug: p.team_slug,
                                            league: league,
                                            lb: lb
                                        });
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
        
        console.log(`Live VPG fetch completed. Found VPG stats for ${vpgStatsMap.size}/${PLAYERS.length} players.\n`);
        
        for (const pName of PLAYERS) {
            console.log(`Jugador: "${pName}"`);
            
            const profile = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            
            if (!profile) {
                console.log('  ❌ Sin perfil en la base de datos.');
                console.log('------------------------------------------------------------');
                continue;
            }
            
            console.log(`  - DB vpgLeagueSlug: "${profile.vpgLeagueSlug || 'N/A'}"`);
            console.log(`  - DB vpgTeamSlug: "${profile.vpgTeamSlug || 'N/A'}"`);
            console.log(`  - DB lastClub: "${profile.lastClub || 'N/A'}"`);
            console.log(`  - DB vpgPoints: ${profile.stats?.vpgPoints} pts`);
            console.log(`  - DB matchesPlayed: ${profile.stats?.matchesPlayed} PJ`);
            console.log(`  - DB vpgLastRaw:`, profile.stats?.vpgLastRaw || 'N/A');
            
            const live = vpgStatsMap.get(pName.toLowerCase());
            if (!live) {
                console.log('  💤 No aparece en ningún leaderboard activo de VPG España (no ha jugado partidos o su equipo no está en las tablas).');
            } else {
                console.log(`  - VPG Live League: "${live.league}"`);
                console.log(`  - VPG Live Team: "${live.teamName}" (slug: ${live.teamSlug})`);
                console.log(`  - VPG Live Points: ${live.points} pts`);
                console.log(`  - VPG Live Matches: ${live.matches} PJ`);
                
                // Check if they match
                const dbSlug = String(profile.vpgTeamSlug || '').toLowerCase().trim();
                const liveSlug = String(live.teamSlug || '').toLowerCase().trim();
                
                if (dbSlug !== liveSlug) {
                    console.log(`  ⚠️ ¡Mismatched Team Slug! DB has "${dbSlug}" but VPG Live has "${liveSlug}" (Transfer/Traspaso detectado).`);
                }
                
                const lastRaw = profile.stats?.vpgLastRaw || profile.stats || {};
                const lastRawPoints = parseFloat(lastRaw.vpgPoints) || 0;
                const lastRawMatches = parseInt(lastRaw.matchesPlayed) || 0;
                
                const deltaPoints = live.points - lastRawPoints;
                const deltaMatches = live.matches - lastRawMatches;
                
                console.log(`  - Delta Calculado: Puntos: +${deltaPoints.toFixed(1)} | Partidos: +${deltaMatches}`);
                if (deltaPoints === 0 && deltaMatches === 0) {
                    console.log(`  ✅ Delta es 0 porque sus estadísticas en VPG coinciden exactamente con el baseline de la DB.`);
                } else if (deltaPoints < 0) {
                    console.log(`  ⚠️ Delta es negativo o 0. Live VPG points (${live.points}) < LastRaw (${lastRawPoints}). Se ignora (Delta = 0).`);
                }
            }
            console.log('------------------------------------------------------------');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
