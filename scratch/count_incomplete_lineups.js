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
        
        const teams = await db.collection('fantasy_teams').find({}).toArray();
        
        let incompleteCount = 0;
        let completeCount = 0;
        
        console.log('=== ANÁLISIS DE TITULARES EN ALINEACIONES (BD) ===\n');
        
        for (const team of teams) {
            const playerStartersStatus = {};
            const lineup = team.lineup || {};
            
            if (lineup.POR) playerStartersStatus[lineup.POR.toLowerCase()] = true;
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && (playerStartersStatus[p.toLowerCase()] = true));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && (playerStartersStatus[p.toLowerCase()] = true));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && (playerStartersStatus[p.toLowerCase()] = true));
            
            const count = Object.keys(playerStartersStatus).length;
            if (count < 11) {
                incompleteCount++;
                // If it is a real league team with at least 1 player
                if (team.players && team.players.length > 0) {
                    console.log(`Equipo: "${team.teamName || team.name}" | Titulares alineados: ${count}/11 | Roster total: ${team.players.length} jugadores`);
                }
            } else {
                completeCount++;
            }
        }
        
        console.log('\n--- RESUMEN ---');
        console.log('Equipos con alineación COMPLETA (11/11):', completeCount);
        console.log('Equipos con alineación INCOMPLETA (< 11):', incompleteCount);
        console.log('Total de equipos:', teams.length);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
