// scratch/update_market_bases.js
import { connectDb, getDb } from '../database.js';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    console.log('[SWEEP] Iniciando barrido manual de basePoints para agentes libres en el mercado...');

    // 1. Obtener todas las ligas activas
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    console.log(`[SWEEP] Cargadas ${leagues.length} ligas.`);

    // 2. Obtener todos los perfiles de jugadores para saber sus vpgPoints actuales
    console.log('[SWEEP] Cargando perfiles de jugadores...');
    const players = await db.collection('player_profiles').find({}).toArray();
    const playerMap = new Map(players.map(p => [p.eaPlayerName.toLowerCase(), p]));
    console.log(`[SWEEP] Cargados ${playerMap.size} perfiles.`);

    // 3. Obtener todos los equipos para colectar los titulares actuales
    const teams = await db.collection('fantasy_teams').find({}).toArray();
    const startersByLeague = {}; // leagueId -> Set of player names (lowercase)

    for (const team of teams) {
        if (!startersByLeague[team.leagueId]) {
            startersByLeague[team.leagueId] = new Set();
        }
        if (team.lineup) {
            const lineup = team.lineup;
            if (lineup.POR) startersByLeague[team.leagueId].add(lineup.POR.toLowerCase());
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && startersByLeague[team.leagueId].add(p.toLowerCase()));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && startersByLeague[team.leagueId].add(p.toLowerCase()));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && startersByLeague[team.leagueId].add(p.toLowerCase()));
        }
    }

    // 4. Para cada liga, recolectar jugadores que NO son titulares y actualizar su base
    let totalUpdated = 0;
    for (const league of leagues) {
        const leagueStarters = startersByLeague[league._id.toString()] || new Set();
        const playersToReset = new Set();

        // Agregar los de basePoints que no son titulares
        if (league.basePoints) {
            Object.keys(league.basePoints).forEach(name => {
                if (!leagueStarters.has(name.toLowerCase())) {
                    playersToReset.add(name);
                }
            });
        }

        // Agregar los de marketFreeAgents que no son titulares
        if (Array.isArray(league.marketFreeAgents)) {
            league.marketFreeAgents.forEach(name => {
                if (!leagueStarters.has(name.toLowerCase())) {
                    playersToReset.add(name);
                }
            });
        }

        const updates = {};
        for (const name of playersToReset) {
            const player = playerMap.get(name.toLowerCase());
            if (player) {
                const { points: rawPoints } = calculatePlayerPointsAndPrice(player);
                // Si la base actual es diferente de los puntos VPG actuales, lo actualizamos
                const currentBase = league.basePoints ? league.basePoints[name] : undefined;
                if (currentBase !== rawPoints) {
                    updates[`basePoints.${player.eaPlayerName}`] = rawPoints;
                }
            }
        }

        const numUpdates = Object.keys(updates).length;
        if (numUpdates > 0) {
            await db.collection('fantasy_leagues').updateOne(
                { _id: league._id },
                { $set: updates }
            );
            console.log(`[SWEEP] Liga "${league.name}": Actualizados basePoints para ${numUpdates} jugadores (no-titulares/libres).`);
            totalUpdated += numUpdates;
        }
    }

    console.log(`[SWEEP] Barrido completado con éxito. Total de bases actualizadas: ${totalUpdated}`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
