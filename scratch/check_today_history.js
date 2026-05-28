// scratch/check_today_history.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // Buscar registros de hoy en fantasy_player_history (2026-05-28)
    const today = new Date('2026-05-28T00:00:00.000Z');
    const historyDocs = await db.collection('fantasy_player_history').find({
        createdAt: { $gte: today }
    }).toArray();

    console.log(`[HISTORY] Encontrados ${historyDocs.length} registros en el historial de hoy.`);

    const startersWithPoints = historyDocs.filter(h => h.wasStarter && h.points > 0);
    console.log(`[HISTORY] De ellos, ${startersWithPoints.length} son titulares con puntos > 0.`);
    
    // Imprimir los primeros 10 como muestra
    console.log('[HISTORY] Muestra de 10 titulares con puntos ganados:');
    startersWithPoints.slice(0, 10).forEach(h => {
        console.log(`  - ${h.playerName} (${h.leagueId}): +${h.points} pts (Equipo: ${h.teamId})`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
