import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    console.log('=== INVESTIGANDO EL CASO MATARATAS FC ===\n');

    // 1. Obtener el equipo Mataratas fc
    const team = await db.collection('fantasy_teams').findOne({ teamName: 'Mataratas fc' });
    if (!team) {
        console.log('❌ No se encontró Mataratas fc');
        await client.close();
        return;
    }

    console.log(`Equipo: ${team.teamName} (ID: ${team._id})`);
    console.log(`Liga ID: ${team.leagueId}`);
    console.log(`Puntos en DB: ${team.points}`);
    console.log(`Presupuesto: ${team.balance}`);
    console.log(`Plantilla: ${team.players.join(', ')}`);
    console.log(`Lineup: ${JSON.stringify(team.lineup)}`);

    // 2. Obtener la liga
    const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
    console.log(`\nLiga: ${league?.name} (Modo: ${league?.pointsMode})`);
    console.log(`Base Points de Retromoneybeatz en la liga: ${league?.basePoints?.['Retromoneybeatz']}`);

    // 3. Obtener el jugador Retromoneybeatz
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: 'Retromoneybeatz' });
    console.log(`\nJugador: Retromoneybeatz`);
    console.log(`VPG Points reales (corregidos en DB): ${player?.stats?.vpgPoints}`);
    
    // 4. Ver las noticias de reward de este equipo para ver qué sumó exactamente
    const news = await db.collection('fantasy_news').find({
        leagueId: team.leagueId,
        $or: [
            { message: { $regex: /Mataratas/i } },
            { 'metadata.teamName': 'Mataratas fc' }
        ]
    }).toArray();

    console.log(`\nNoticias registradas para Mataratas fc (${news.length}):`);
    for (const n of news) {
        console.log(`- [${n.createdAt?.toISOString()}] ${n.message}`);
    }

    await client.close();
}

main().catch(console.error);
