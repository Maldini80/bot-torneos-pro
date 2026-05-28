// scratch/check_alex_points.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Buscar el perfil de alexluciamaquina
    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /^alexluciamaquina$/i }
    });
    console.log('[ALEX] Perfil:', player ? { eaPlayerName: player.eaPlayerName, stats: player.stats } : 'No encontrado');

    // 2. Buscar en las ligas fantasy su basePoints
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    for (const league of leagues) {
        if (league.basePoints) {
            const foundKey = Object.keys(league.basePoints).find(k => k.toLowerCase() === 'alexluciamaquina');
            if (foundKey) {
                console.log(`[ALEX] En liga "${league.name}" basePoints: ${league.basePoints[foundKey]}`);
            }
        }
    }

    // 3. Buscar historial de alexluciamaquina hoy
    const history = await db.collection('fantasy_player_history').find({
        playerName: { $regex: /^alexluciamaquina$/i }
    }).toArray();
    console.log('[ALEX] Historial hoy:', history);

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
