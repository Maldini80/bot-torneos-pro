// scratch/restore_gameweek_bases.js
import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';
import 'dotenv/config';

const DRY_RUN = false; // Cambiar a false para aplicar los cambios a la base de datos

async function main() {
    await connectDb();
    const db = getDb();

    console.log(`[RESTORER] Iniciando restauración de basePoints... (Modo DRY_RUN = ${DRY_RUN})`);

    // 1. Obtener todos los perfiles de jugadores para hacer lookup rápido
    console.log('[RESTORER] Cargando perfiles de jugadores...');
    const allPlayers = await db.collection('player_profiles').find({}).toArray();
    const playerMap = new Map(allPlayers.map(p => [p.eaPlayerName.toLowerCase(), p]));
    console.log(`[RESTORER] Cargados ${playerMap.size} perfiles.`);

    // 2. Obtener los registros del historial de hoy (28 de Mayo de 2026)
    const today = new Date('2026-05-28T00:00:00.000Z');
    const historyDocs = await db.collection('fantasy_player_history').find({
        createdAt: { $gte: today },
        wasStarter: true
    }).toArray();
    console.log(`[RESTORER] Encontrados ${historyDocs.length} registros de titulares en el historial de hoy.`);

    // 3. Procesar y restaurar bases
    let successCount = 0;
    let notFoundCount = 0;
    let sampleCount = 0;

    for (const doc of historyDocs) {
        const playerNameLower = doc.playerName.toLowerCase();
        const player = playerMap.get(playerNameLower);
        if (!player) {
            notFoundCount++;
            continue;
        }

        const { points: currentVpgPoints } = calculatePlayerPointsAndPrice(player);
        const restoredBase = Math.max(0, Math.round((currentVpgPoints - doc.points) * 10) / 10);

        if (sampleCount < 15) {
            console.log(`  - Muestra ${sampleCount + 1}: ${player.eaPlayerName} (Liga: ${doc.leagueId})`);
            console.log(`    Puntos VPG actuales: ${currentVpgPoints}`);
            console.log(`    Puntos ganados en la jornada: ${doc.points}`);
            console.log(`    Base a restaurar: ${restoredBase}`);
            sampleCount++;
        }

        if (!DRY_RUN) {
            // Actualizar la base de puntos de la liga
            await db.collection('fantasy_leagues').updateOne(
                { _id: new ObjectId(doc.leagueId) },
                { $set: { [`basePoints.${player.eaPlayerName}`]: restoredBase } }
            );
        }
        successCount++;
    }

    console.log(`\n[RESTORER] Resumen de ejecución:`);
    console.log(`  - Procesados exitosamente: ${successCount}`);
    console.log(`  - Perfiles no encontrados: ${notFoundCount}`);
    console.log(`  - Total registros evaluados: ${historyDocs.length}`);
    console.log(`[RESTORER] Completado.`);

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
