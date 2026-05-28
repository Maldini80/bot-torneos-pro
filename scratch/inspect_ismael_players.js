import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const PLAYERS = [
    "Adi2009-2016",
    "Joviamhill",
    "Lotus_MLG",
    "Melow14",
    "tomas_manises",
    "JPPArtist",
    "Sevilla98M",
    "aroval0",
    "FNICOLA24",
    "ChiiinO9",
    "eldelimpact"
];

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    console.log('=== INVESTIGACIÓN DETALLADA DE JUGADORES DE ISMAEL22614 ===\n');
    
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        for (const pName of PLAYERS) {
            console.log(`👤 Jugador: "${pName}"`);
            
            const profile = await db.collection('player_profiles').findOne({
                eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            
            if (!profile) {
                console.log('  ❌ Sin perfil en la base de datos.');
                console.log('------------------------------------------------------------');
                continue;
            }
            
            const vpgLeague = profile.vpgLeagueSlug || 'Desconocida';
            const vpgTeam = profile.vpgTeamSlug || 'Desconocido';
            const dbPoints = profile.stats?.vpgPoints || 0;
            const dbPJ = profile.stats?.matchesPlayed || 0;
            const lastRaw = profile.stats?.vpgLastRaw || profile.stats || {};
            const lastRawPoints = lastRaw.vpgPoints || 0;
            
            console.log(`  - DB League: "${vpgLeague}" | Team: "${vpgTeam}" (lastClub: "${profile.lastClub || 'N/A'}")`);
            console.log(`  - DB stats: Puntos VPG: ${dbPoints} | PJ: ${dbPJ}`);
            console.log(`  - Baseline VPG: Puntos: ${lastRawPoints} | PJ: ${lastRaw.matchesPlayed || 0}`);
            
            if (profile.vpgTeamSlug) {
                const url = `https://api.virtualprogaming.com/public/teams/${profile.vpgTeamSlug}/matches/?match_status=complete`;
                try {
                    const res = await fetch(url, { headers: HEADERS });
                    if (res.ok) {
                        const data = await res.json();
                        const matches = Array.isArray(data) ? data : (data.data || data.results || []);
                        
                        // Filter matches on May 26, 2026 (yesterday)
                        const yesterdayMatches = matches.filter(m => {
                            if (!m.datetime) return false;
                            const d = new Date(m.datetime);
                            const madridDate = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
                            return madridDate === '2026-05-27' || madridDate === '2026-05-26'; // also check local time wrap
                        });
                        
                        console.log(`  - Partidos completados del equipo ayer (26 de mayo): ${yesterdayMatches.length}`);
                        
                        if (yesterdayMatches.length > 0) {
                            yesterdayMatches.forEach(m => {
                                const d = new Date(m.datetime);
                                const madridTime = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
                                console.log(`    * [${madridTime}] J${m.match_day}: ${m.home_name} (${m.home_score}) vs ${m.away_name} (${m.away_score})`);
                            });
                        } else {
                            console.log(`    * El equipo NO tuvo partidos ayer.`);
                        }
                    } else {
                        console.log(`  ❌ Error fetching matches from VPG API (HTTP ${res.status})`);
                    }
                } catch (e) {
                    console.log(`  ❌ Exception fetching matches: ${e.message}`);
                }
            } else {
                console.log(`  * No tiene club de VPG asignado.`);
            }
            console.log('------------------------------------------------------------\n');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
