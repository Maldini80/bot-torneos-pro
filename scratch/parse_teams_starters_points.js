import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

// VPG position leaderboards map (from simulate_sync.js)
const LEADERBOARD_POS_MAP = {
    'top_gk': 'POR',
    'top_cb': 'DFC',
    'top_fb': 'CARR',
    'top_cdm': 'MC',
    'top_cam': 'MC',
    'top_wingers': 'CARR',
    'top_strikers': 'DC'
};

async function run() {
    console.log('=== ANALIZANDO JUGADORES TITULARES QUE SUMARON 0 PUNTOS ===\n');
    
    // Read simulation results
    let simText = '';
    try {
        simText = fs.readFileSync('scratch/resultado_simulacion.txt', 'utf-8');
    } catch (e) {
        console.error('Error al leer el archivo de simulación:', e.message);
        return;
    }
    
    // Parse player deltas from simulation output
    // Format: "1. username (Club): anterior: X pts -> actual: Y pts (Delta: +Z pts)"
    // Or from the details of the team rewards: "Jugadores que aportaron: name (+X pts)"
    const playerDeltas = new Map(); // nameLower -> delta (number)
    
    // Parse all deltas from lines like:
    // "1. username (Club): anterior: 10 pts -> actual: 12 pts (Delta: +2 pts)"
    // We can also extract deltas calculated from the leaderboard crawl log
    // Let's parse all lines to find the deltas
    const lines = simText.split('\n');
    for (const line of lines) {
        // Match player delta in top list
        // e.g. "1. Adrianbr03 (RYSIX GAMING): anterior: 188.2 pts -> actual: 224.6 pts (Delta: +36.4 pts)"
        const match = line.match(/\d+\.\s+(\S+)\s+\([^)]+\):\s+anterior:\s+[\d.]+\s+pts\s+->\s+actual:\s+[\d.]+\s+pts\s+\(Delta:\s+\+([\d.]+)\s+pts\)/);
        if (match) {
            playerDeltas.set(match[1].toLowerCase(), parseFloat(match[2]));
        }
        
        // Also match from team details: "Jugadores que aportaron: name (+X pts), name2 (+Y pts)"
        if (line.includes('Jugadores que aportaron:')) {
            const parts = line.split('Jugadores que aportaron:')[1].split(',');
            parts.forEach(p => {
                const m = p.trim().match(/(\S+)\s+\(\+([\d.]+)\s+pts\)/);
                if (m) {
                    playerDeltas.set(m[1].toLowerCase(), parseFloat(m[2]));
                }
            });
        }
    }
    
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        // Load all active leagues
        const activeLeagues = await db.collection('fantasy_leagues').find({ status: { $ne: 'closed' } }).toArray();
        const activeLeagueIds = activeLeagues.map(l => String(l._id));
        const activeLeaguesMap = {};
        activeLeagues.forEach(l => {
            activeLeaguesMap[String(l._id)] = l;
        });
        
        // Load all teams
        const teams = await db.collection('fantasy_teams').find({ leagueId: { $in: activeLeagueIds } }).toArray();
        
        let teamsCount = 0;
        
        for (const team of teams) {
            const lineup = team.lineup || {};
            const starters = [];
            if (lineup.POR) starters.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && starters.push(p));
            
            if (starters.length === 11) {
                // Check if any starter in this team scored 0 points
                const zeroStarters = [];
                const positiveStarters = [];
                
                for (const pName of starters) {
                    const delta = playerDeltas.get(pName.toLowerCase()) || 0;
                    if (delta === 0) {
                        zeroStarters.push(pName);
                    } else {
                        positiveStarters.push({ name: pName, delta });
                    }
                }
                
                // If there are any starters who scored 0 points
                if (zeroStarters.length > 0) {
                    teamsCount++;
                    const league = activeLeaguesMap[team.leagueId];
                    const leagueName = league ? league.name : 'Unknown';
                    
                    console.log(`Equipo: "${team.teamName || team.name}" (Liga: "${leagueName}")`);
                    console.log(`  * Puntos del equipo sumados ayer: +${positiveStarters.reduce((acc, p) => acc + p.delta, 0).toFixed(1)} pts`);
                    if (positiveStarters.length > 0) {
                        console.log(`  * Titulares que SÍ sumaron: ${positiveStarters.map(p => `${p.name} (+${p.delta} pts)`).join(', ')}`);
                    } else {
                        console.log(`  * Titulares que SÍ sumaron: Ninguno`);
                    }
                    console.log(`  * Titulares con 0 puntos: ${zeroStarters.join(', ')}`);
                    console.log('------------------------------------------------------------');
                }
            }
        }
        
        console.log(`\nTotal de equipos analizados con 11 titulares y algún jugador a cero: ${teamsCount}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
