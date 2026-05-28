import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    console.log('=== BUSCANDO EQUIPOS QUE RECIBIERON RECOMPENSAS EN EL SYNC DE LAS 07:32 ===\n');

    const startSync = new Date('2026-05-27T07:20:00.000Z');
    const endSync = new Date('2026-05-27T07:45:00.000Z');

    const newsList = await db.collection('fantasy_news').find({
        type: 'reward',
        createdAt: { $gte: startSync, $lte: endSync }
    }).toArray();

    console.log(`Encontradas ${newsList.length} noticias de recompensa en ese rango de tiempo.`);

    const buggyTeams = new Set();
    for (const n of newsList) {
        // Encontrar el nombre del equipo del mensaje o metadatos
        const teamName = n.metadata?.teamName || (n.message.match(/💰 (.*?) recibe/) || n.message.match(/El equipo \*\*(.*?)\*\*/))?.[1];
        if (teamName) {
            buggyTeams.add(teamName.trim());
        }
    }

    console.log(`\nLista de equipos que SÍ recibieron puntos en el sync buggy (total: ${buggyTeams.size}):`);
    const sorted = Array.from(buggyTeams).sort();
    for (const name of sorted) {
        console.log(`- ${name}`);
    }

    await client.close();
}

main().catch(console.error);
