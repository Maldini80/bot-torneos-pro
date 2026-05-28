import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const PLAYERS = ["Raauwlito18", "KBSA-TH", "QuintuRSG", "Unluckybeast9", "AlvaroSMX7"];

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    console.log('=== INVESTIGACIÓN DE TITULARES COMUNES A CERO ===\n');
    
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
            
            // Check matches yesterday for their VPG team
            if (profile.vpgTeamSlug) {
                const url = `https://api.virtualprogaming.com/public/teams/${profile.vpgTeamSlug}/matches/?match_status=complete`;
                try {
                    const res = await fetch(url, { headers: HEADERS });
                    if (res.ok) {
                        const data = await res.json();
                        const matches = Array.isArray(data) ? data : (data.data || data.results || []);
                        
                        console.log(`  - Partidos completados del equipo en VPG: ${matches.length}`);
                        
                        // Check if they played yesterday (May 26)
                        const yesterdayMatches = matches.filter(m => {
                            if (!m.datetime) return false;
                            const d = new Date(m.datetime);
                            const madridDate = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
                            return madridDate === '2026-05-26';
                        });
                        
                        if (yesterdayMatches.length > 0) {
                            console.log(`    * ¡SÍ jugaron ayer! (${yesterdayMatches.length} partido/s):`);
                            yesterdayMatches.forEach(m => {
                                const d = new Date(m.datetime);
                                const madridTime = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
                                console.log(`      [${madridTime}] J${m.match_day}: ${m.home_name} (${m.home_score}) vs ${m.away_name} (${m.away_score})`);
                            });
                            
                            // Check if they are in the leaderboard for their position
                            // If they are in the leaderboard, did their points change?
                            console.log(`    * El jugador obtuvo delta 0 porque no jugó/no participó en los partidos o sus estadísticas no registraron incrementos en VPG.`);
                        } else {
                            console.log(`    * El equipo NO tuvo partidos ayer (26 de mayo). Por lo tanto, el jugador no pudo puntuar.`);
                        }
                    } else {
                        console.log(`  ❌ Error fetching VPG team matches: HTTP ${res.status}`);
                    }
                } catch (err) {
                    console.log(`  ❌ Error al conectar con VPG: ${err.message}`);
                }
            } else {
                console.log(`  * El jugador no tiene un club de VPG asignado en la base de datos.`);
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
