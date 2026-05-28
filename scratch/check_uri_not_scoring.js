// scratch/check_uri_not_scoring.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Encontrar los equipos de Uri
    // Buscamos equipos donde el owner sea Uri o similar. Let's find uri's discordId first.
    // Busquemos equipos que contengan "uri" en el teamName o manager o discordId
    const uriTeams = await db.collection('fantasy_teams').find({
        $or: [
            { teamName: { $regex: /uri/i } },
            { discordId: "367375253818802176" }, // Discord ID común para managers/uri
            { discordId: { $regex: /367375/ } }
        ]
    }).toArray();

    console.log(`[URI TEAMS] Encontrados ${uriTeams.length} equipos para URI:`);

    for (const team of uriTeams) {
        const league = await db.collection('fantasy_leagues').findOne({ _id: team.leagueId });
        console.log(`\n- Equipo: "${team.teamName}" (ID: ${team._id}) en Liga: "${league ? league.name : 'Desconocida'}" (ID: ${team.leagueId})`);
        
        // Contar titulares alineados
        const starters = [];
        if (team.lineup) {
            const lineup = team.lineup;
            if (lineup.POR) starters.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && starters.push(p));
        }
        console.log(`  Titulares alineados (${starters.length}):`, starters);
        
        // Ver puntos de hoy en el historial
        const today = new Date('2026-05-28T00:00:00.000Z');
        const historyDocs = await db.collection('fantasy_player_history').find({
            teamId: team._id.toString(),
            createdAt: { $gte: today }
        }).toArray();
        
        console.log(`  Registros en el historial hoy: ${historyDocs.length}`);
        const totalDelta = historyDocs.filter(h => h.wasStarter).reduce((sum, h) => sum + h.points, 0);
        console.log(`  Puntos ganados hoy por titulares: ${Math.round(totalDelta * 10) / 10} pts`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
