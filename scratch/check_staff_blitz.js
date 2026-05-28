// scratch/check_staff_blitz.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Encontrar la liga STAFF BLITZ
    const league = await db.collection('fantasy_leagues').findOne({
        name: { $regex: /staff blitz/i }
    });
    if (!league) {
        console.log('Liga STAFF BLITZ no encontrada.');
        process.exit(0);
    }
    console.log(`[STAFF BLITZ] Liga encontrada: "${league.name}" (ID: ${league._id})`);

    // 2. Encontrar todos los equipos en esta liga
    const teams = await db.collection('fantasy_teams').find({
        leagueId: league._id.toString()
    }).toArray();

    console.log(`[STAFF BLITZ] Encontrados ${teams.length} equipos:`);
    for (const team of teams) {
        const starters = [];
        if (team.lineup) {
            const lineup = team.lineup;
            if (lineup.POR) starters.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && starters.push(p));
        }
        console.log(`  - Equipo: "${team.teamName}" | Mánager Discord ID: ${team.discordId} | Titulares: ${starters.length}`);
        
        // Ver puntos de hoy en el historial
        const today = new Date('2026-05-28T00:00:00.000Z');
        const historyDocs = await db.collection('fantasy_player_history').find({
            teamId: team._id.toString(),
            createdAt: { $gte: today }
        }).toArray();
        const totalDelta = historyDocs.filter(h => h.wasStarter).reduce((sum, h) => sum + h.points, 0);
        console.log(`    Puntos ganados hoy por titulares: ${Math.round(totalDelta * 10) / 10} pts`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
