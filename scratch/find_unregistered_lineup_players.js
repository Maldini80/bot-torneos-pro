import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== VERIFICACIÓN DE JUGADORES ALINEADOS SIN PERFIL EN BD ===\n');
        
        const teams = await db.collection('fantasy_teams').find({}).toArray();
        const profiles = await db.collection('player_profiles').find({}, { projection: { eaPlayerName: 1 } }).toArray();
        const profileNames = new Set(profiles.map(p => p.eaPlayerName.toLowerCase()));
        
        let missingStartersCount = 0;
        
        for (const team of teams) {
            const starters = [];
            const lineup = team.lineup || {};
            
            if (lineup.POR) starters.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) starters.push(...lineup.DFC.filter(Boolean));
            if (Array.isArray(lineup.MC)) starters.push(...lineup.MC.filter(Boolean));
            if (Array.isArray(lineup.DC)) starters.push(...lineup.DC.filter(Boolean));
            
            // Only check teams with 11 starters
            if (starters.length === 11) {
                const missingInThisTeam = [];
                for (const pName of starters) {
                    if (!profileNames.has(pName.toLowerCase())) {
                        missingInThisTeam.push(pName);
                    }
                }
                
                if (missingInThisTeam.length > 0) {
                    missingStartersCount += missingInThisTeam.length;
                    let leagueName = 'Liga Desconocida';
                    const league = await db.collection('fantasy_leagues').findOne({ _id: team.leagueId });
                    if (league) leagueName = league.name;
                    
                    console.log(`Equipo: "${team.teamName || team.name}" (Liga: ${leagueName})`);
                    console.log(`  - Jugador(es) alineado(s) sin perfil: ${missingInThisTeam.join(', ')}`);
                }
            }
        }
        
        console.log('\n--- RESUMEN ---');
        console.log(`Total de jugadores titulares alineados sin perfil en BD: ${missingStartersCount}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
