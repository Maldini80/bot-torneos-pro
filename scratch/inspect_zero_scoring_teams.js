import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

// List of the 36 teams that scored 0 in the simulation
const ZERO_TEAMS_LIST = [
    "Real Oviedo", "Caicedo", "Palmilla Fc", "Visca team", "Perez FC", 
    "Frente Atletico", "Team Khabib", "tralarero", "Gafe FC", "HansiSudaca", 
    "Real betis", "Payos fc", "Ismael", "El Pruebas", "Abollados FC", 
    "Aldaia", "Atleti", "IG de Joseda🍻", "SrShini", "Jonnie Walker Fc", 
    "Ismael22614", "Zxgarii Players", "Asilota", "MS esports", "Luislly", 
    "Marcospedro07", "Vicpano", "Siu", "Decadicadi", "Ikonkk", 
    "Banano", "r3egegh3", "Er Rolex", "CRISO FC", "Akasrey"
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
        
        console.log('=== ANÁLISIS DE LOS EQUIPOS CON 0 PUNTOS EN LA SIMULACIÓN ===\n');
        
        // 1. Fetch live standings from VPG to see who actually had points yesterday
        console.log('Fetching live VPG data to check player points...');
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
                                        vpgPlayers.set(p.username.toLowerCase(), {
                                            points: parseFloat(p.points) || 0,
                                            matches: parseInt(p.matches_played) || 0,
                                            team: p.team_name,
                                            league: league
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
        
        console.log(`Live VPG data parsed: ${vpgPlayers.size} players found.\n`);
        
        // Find matching fantasy teams
        const teams = await db.collection('fantasy_teams').find({
            $or: [
                { name: { $in: ZERO_TEAMS_LIST } },
                { teamName: { $in: ZERO_TEAMS_LIST } }
            ]
        }).toArray();
        
        for (const team of teams) {
            const teamName = team.teamName || team.name;
            const league = await db.collection('fantasy_leagues').findOne({ _id: team.leagueId });
            const leagueName = league ? league.name : 'Unknown League';
            const basePointsMap = league ? league.basePoints || {} : {};
            
            const starters = [];
            const lineup = team.lineup || {};
            if (lineup.POR) starters.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) starters.push(...lineup.DFC.filter(Boolean));
            if (Array.isArray(lineup.MC)) starters.push(...lineup.MC.filter(Boolean));
            if (Array.isArray(lineup.DC)) starters.push(...lineup.DC.filter(Boolean));
            
            console.log(`Equipo: "${teamName}" (Liga: ${leagueName})`);
            console.log(`Titulares alineados (${starters.length}/11):`);
            
            let reasons = [];
            
            for (const pName of starters) {
                const pNameLower = pName.toLowerCase();
                const pProfile = await db.collection('player_profiles').findOne({
                    eaPlayerName: { $regex: new RegExp('^' + pName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
                });
                
                if (!pProfile) {
                    reasons.push(`  ❌ [${pName}]: Sin perfil en base de datos.`);
                    continue;
                }
                
                const liveData = vpgPlayers.get(pNameLower);
                const currentVpgPoints = pProfile.stats?.vpgPoints || 0;
                const baseValue = basePointsMap[pProfile.eaPlayerName] !== undefined ? basePointsMap[pProfile.eaPlayerName] : 0;
                
                if (!liveData) {
                    reasons.push(`  ℹ️ [${pName}]: No aparece en los leaderboards activos de VPG (posiblemente su equipo no ha jugado ningún partido o el jugador no ha debutado).`);
                } else {
                    // Check delta between live VPG points and player profile stats
                    const lastRaw = pProfile.stats?.vpgLastRaw || pProfile.stats || {};
                    const lastRawPoints = parseFloat(lastRaw.vpgPoints) || 0;
                    const delta = liveData.points - lastRawPoints;
                    
                    if (delta <= 0) {
                        reasons.push(`  💤 [${pName}]: No jugó o no sumó puntos ayer en VPG (Puntos VPG: ${liveData.points} | Baseline previo: ${lastRawPoints} | Delta: 0)`);
                    } else {
                        reasons.push(`  📈 [${pName}]: SÍ SUMÓ (Delta: +${delta.toFixed(1)} pts).`);
                    }
                }
            }
            
            reasons.forEach(r => console.log(r));
            console.log('------------------------------------------------------------\n');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
