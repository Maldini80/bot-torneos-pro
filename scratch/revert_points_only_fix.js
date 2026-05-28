import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    console.log('=== REVERTIENDO LA CORRECCIÓN DE PUNTOS ANTERIOR ===\n');

    // 1. Buscar las noticias de corrección creadas hoy
    const newsList = await db.collection('fantasy_news').find({
        type: 'reward',
        message: { $regex: /CORRECCIÓN JORNADA/ },
        'metadata.pointsCorrected': { $exists: true }
    }).toArray();

    console.log(`Encontradas ${newsList.length} noticias de corrección para revertir.`);

    for (const news of newsList) {
        const teamName = news.metadata.teamName;
        const leagueId = news.leagueId;
        const pointsCorrected = news.metadata.pointsCorrected; // es un número negativo, ej: -233.5

        const team = await db.collection('fantasy_teams').findOne({
            teamName,
            leagueId
        });

        if (team) {
            const currentPoints = team.points || 0;
            const originalPoints = Math.round((currentPoints - pointsCorrected) * 10) / 10; // restar un negativo suma

            // Restaurar los puntos originales del equipo
            await db.collection('fantasy_teams').updateOne(
                { _id: team._id },
                { $set: { points: originalPoints } }
            );

            console.log(`Revertido: ${team.teamName} (Liga ID: ${team.leagueId}): ${currentPoints} -> ${originalPoints}`);
        } else {
            console.log(`❌ No se encontró el equipo "${teamName}" en la liga ${leagueId}`);
        }
    }

    // 2. Eliminar las noticias de corrección que creamos
    const deleteRes = await db.collection('fantasy_news').deleteMany({
        type: 'reward',
        message: { $regex: /CORRECCIÓN JORNADA/ },
        'metadata.pointsCorrected': { $exists: true }
    });
    console.log(`\nEliminadas ${deleteRes.deletedCount} noticias de corrección.`);

    await client.close();
}

main().catch(console.error);
