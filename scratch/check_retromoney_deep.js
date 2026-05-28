import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;
const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function main() {
    // 1. Buscar directamente en la API de VPG los puntos actuales de Retromoneybeatz
    console.log('=== BUSCANDO EN API DE VPG ===');
    
    // Buscar en superliga-spain-b (su liga según la DB)
    const leagues = ['superliga-spain-a', 'superliga-spain-b'];
    const positions = ['top_strikers', 'top_cam', 'top_wingers', 'top_cdm', 'top_cb', 'top_fb', 'top_gk'];
    
    for (const league of leagues) {
        for (const pos of positions) {
            let offset = 0;
            let found = false;
            while (offset < 300 && !found) {
                const url = `https://api.virtualprogaming.com/public/leagues/${league}/leaderboard?leaderboard=${pos}&type=all&limit=30&offset=${offset}`;
                try {
                    const res = await fetch(url, { headers: HEADERS });
                    if (res.ok) {
                        const data = await res.json();
                        const players = data.data || [];
                        if (players.length === 0) break;
                        
                        const retro = players.find(p => p.username && p.username.toLowerCase().includes('retromone'));
                        if (retro) {
                            console.log(`\nENCONTRADO en ${league} / ${pos}:`);
                            console.log(JSON.stringify(retro, null, 2));
                            found = true;
                        }
                    }
                } catch (e) {
                    console.error(`Error fetching ${league}/${pos}:`, e.message);
                }
                offset += 30;
            }
        }
    }
    
    // 2. Buscar contratos activos
    console.log('\n=== CONTRATOS ACTIVOS ===');
    try {
        const contractsUrl = `https://api.virtualprogaming.com/public/users/Retromoneybeatz/contracts/`;
        const res = await fetch(contractsUrl, { headers: HEADERS });
        if (res.ok) {
            const contracts = await res.json();
            console.log(JSON.stringify(contracts, null, 2));
        }
    } catch (e) {
        console.error('Error fetching contracts:', e.message);
    }
    
    // 3. Conectar a DB y ver las ligas que usan modo zero vs normal
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    // Buscar todas las ligas donde está este jugador y su pointsMode
    const teams = await db.collection('fantasy_teams').find({
        players: { $regex: /retromone/i }
    }).toArray();
    
    console.log('\n=== EQUIPOS FANTASY CON RETROMONEYBEATZ ===');
    for (const team of teams) {
        const league = await db.collection('fantasy_leagues').findOne({ _id: team.leagueId });
        if (!league) {
            // Try with ObjectId
            try {
                const { ObjectId } = await import('mongodb');
                const league2 = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
                if (league2) {
                    const base = league2.basePoints ? (league2.basePoints['Retromoneybeatz'] || 'N/A') : 'N/A';
                    console.log(`  Liga: ${league2.name} | Modo: ${league2.pointsMode || 'normal'} | BasePoints: ${base} | Equipo: ${team.teamName} | Puntos equipo: ${team.points}`);
                    continue;
                }
            } catch (e) {}
            console.log(`  Liga: DESCONOCIDA (leagueId: ${team.leagueId}) | Equipo: ${team.teamName} | Puntos equipo: ${team.points}`);
            continue;
        }
        const base = league.basePoints ? (league.basePoints['Retromoneybeatz'] || 'N/A') : 'N/A';
        console.log(`  Liga: ${league.name} | Modo: ${league.pointsMode || 'normal'} | BasePoints: ${base} | Equipo: ${team.teamName} | Puntos equipo: ${team.points}`);
    }
    
    // 4. Mirar el perfil del jugador - stats.vpgLastRaw
    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /retromone/i }
    });
    
    if (player) {
        console.log('\n=== VPG LAST RAW (último snapshot de VPG crawleado) ===');
        console.log(JSON.stringify(player.stats?.vpgLastRaw || 'NO HAY vpgLastRaw', null, 2));
        
        console.log('\n=== STATS ACUMULADAS EN DB ===');
        const s = player.stats || {};
        console.log(`matchesPlayed: ${s.matchesPlayed}`);
        console.log(`goals: ${s.goals}`);
        console.log(`assists: ${s.assists}`);
        console.log(`vpgPoints: ${s.vpgPoints}`);
        console.log(`wins: ${s.wins}`);
        console.log(`losses: ${s.losses}`);
        console.log(`ties: ${s.ties}`);
        console.log(`ratings count: ${(s.ratings || []).length}`);
        console.log(`cleanSheets: ${s.cleanSheets}`);
    }
    
    await client.close();
}

main().catch(console.error);
