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
        
        console.log('=== EQUIPOS CON ALINEACIÓN INCOMPLETA Y SUS PUNTOS ===\n');
        
        let count = 0;
        for (const t of teams) {
            const starters = {};
            const lineup = t.lineup || {};
            if (lineup.POR) starters[lineup.POR.toLowerCase()] = true;
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && (starters[p.toLowerCase()] = true));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && (starters[p.toLowerCase()] = true));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && (starters[p.toLowerCase()] = true));
            
            const numStarters = Object.keys(starters).length;
            if (numStarters < 11 && t.players && t.players.length > 0) {
                count++;
                if (count <= 30) {
                    console.log(`- ${t.teamName} (${t.discordUsername}): ${numStarters}/11 titulares | Puntos actuales: ${t.points || 0} pts | Presupuesto: ${(t.balance || 0).toLocaleString()} €`);
                }
            }
        }
        console.log(`\nTotal de equipos afectados mostrados: ${Math.min(count, 30)} de ${count} totales.`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
