// scratch/check_sync_runs.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // Encontrar cantidad de registros en total en fantasy_player_history
    const totalCount = await db.collection('fantasy_player_history').countDocuments();
    console.log(`[HISTORY] Total de registros en la colección: ${totalCount}`);

    // Agrupar por createdAt o ver fechas únicas de creación de los registros
    const dates = await db.collection('fantasy_player_history').distinct('createdAt');
    console.log(`[HISTORY] Fechas únicas en el historial:`, dates.map(d => d.toISOString()));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
