import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== BUSCANDO EQUIPOS CON 11 TITULARES Y 0 PUNTOS EN LIGAS ACTIVAS ===\n');
        
        // 1. Get active leagues
        const activeLeagues = await db.collection('fantasy_leagues').find({
            status: { $ne: 'closed' }
        }).toArray();
        
        const activeLeagueIds = activeLeagues.map(l => String(l._id));
        const activeLeaguesMap = {};
        activeLeagues.forEach(l => {
            activeLeaguesMap[String(l._id)] = l;
        });
        
        console.log(`Ligas activas encontradas: ${activeLeagues.length}`);
        
        // 2. Load all teams in active leagues
        const teams = await db.collection('fantasy_teams').find({
            leagueId: { $in: activeLeagueIds }
        }).toArray();
        
        console.log(`Total de equipos en ligas activas: ${teams.length}`);
        
        let matchCount = 0;
        let zeroPointsCount = 0;
        
        const results = [];
        
        for (const team of teams) {
            const league = activeLeaguesMap[team.leagueId];
            
            // Count starters
            const lineup = team.lineup || {};
            const starters = [];
            
            if (lineup.POR) starters.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && starters.push(p));
            
            const numStarters = starters.length;
            
            // We only care about teams with exactly 11 starters
            if (numStarters === 11) {
                matchCount++;
                const teamPoints = team.points !== undefined ? team.points : 0;
                
                if (teamPoints === 0) {
                    zeroPointsCount++;
                    results.push({
                        teamName: team.teamName || team.name,
                        teamId: team._id,
                        leagueName: league ? league.name : 'Desconocida',
                        leagueId: team.leagueId,
                        ownerDiscordId: team.discordId,
                        starters: starters
                    });
                }
            }
        }
        
        console.log(`\nEquipos con exactamente 11 titulares: ${matchCount}`);
        console.log(`Equipos con exactamente 11 titulares y 0 puntos en la DB: ${zeroPointsCount}\n`);
        
        results.forEach((r, idx) => {
            console.log(`${idx + 1}. Equipo: "${r.teamName}" (ID: ${r.teamId})`);
            console.log(`   - Liga: "${r.leagueName}" (ID: ${r.leagueId})`);
            console.log(`   - Propietario (Discord ID): ${r.ownerDiscordId}`);
            console.log(`   - Once Titular: ${r.starters.join(', ')}`);
            console.log('------------------------------------------------------------');
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
