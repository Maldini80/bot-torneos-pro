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
        
        const leagueId = '6a10abe66bb40cd90498cca8';
        console.log(`--- BUSCANDO EQUIPOS EN LA LIGA "jam esports" (${leagueId}) ---`);
        
        const teams = await db.collection('fantasy_teams').find({ leagueId: leagueId }).toArray();
        console.log(`Encontrados ${teams.length} equipos en la liga.`);
        
        // Vamos a ver las noticias de recompensa de esta liga
        console.log('\n--- NOTICIAS DE RECOMPENSAS DE HOY EN ESTA LIGA ---');
        const news = await db.collection('fantasy_news').find({
            leagueId: leagueId,
            type: 'reward'
        }).sort({ createdAt: -1 }).limit(20).toArray();
        
        for (const n of news) {
            console.log(`[${n.createdAt.toISOString()}] ${n.message}`);
        }
        
        console.log('\n--- DETALLE DE EQUIPOS EN LA LIGA ---');
        for (const t of teams) {
            const starters = [];
            const lineup = t.lineup || {};
            if (lineup.POR) starters.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && starters.push(p));
            
            console.log(`- ${t.teamName} (${t.discordUsername}) | Puntos: ${t.points} | Balance: ${t.balance.toLocaleString('es-ES')} € | Titulares: ${starters.length}/11`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
