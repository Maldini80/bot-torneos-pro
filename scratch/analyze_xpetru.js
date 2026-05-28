import { connectDb, getDb } from '../database.js';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';
import 'dotenv/config';

async function run() {
    console.log('[ANALYZE XPETRU] Conectando a la base de datos...');
    await connectDb();
    const db = getDb();
    
    // Search in player_profiles
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: "xpetruu" });
    if (!player) {
        console.log('[ANALYZE XPETRU] No se encontró a xpetruu.');
        process.exit(0);
    }
    
    const { price, points, avgRating } = calculatePlayerPointsAndPrice(player);
    console.log(`\n--- ANÁLISIS DE XPETRUU ---`);
    console.log(`EA Player Name: ${player.eaPlayerName}`);
    console.log(`Club VPG: ${player.lastClub} (${player.vpgTeamSlug})`);
    console.log(`Liga VPG: ${player.vpgLeagueSlug}`);
    console.log(`Posición: ${player.manualPosition || player.lastPosition}`);
    console.log(`Puntos oficiales VPG: ${points}`);
    console.log(`Partidos Jugados: ${player.stats?.matchesPlayed || 0}`);
    console.log(`Rating Promedio Calculado: ${avgRating.toFixed(2)}`);
    console.log(`Precio Dinámico Calculado: ${price.toLocaleString('es-ES')} €`);
    
    const defaultMult = 1.5;
    console.log(`Cláusula Dinámica por Defecto (x${defaultMult}): ${(price * defaultMult).toLocaleString('es-ES')} €`);
    
    console.log(`\n--- PARTICIPACIÓN EN EQUIPOS DEL FANTASY ---`);
    const teams = await db.collection('fantasy_teams').find({
        players: { $regex: new RegExp('^' + player.eaPlayerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
    }).toArray();
    
    const leagues = await db.collection('fantasy_leagues').find().toArray();
    const leaguesMap = new Map(leagues.map(l => [l._id.toString(), l]));
    
    for (const team of teams) {
        const league = leaguesMap.get(team.leagueId);
        const lName = league ? league.name : 'Desconocida';
        const mult = league ? (league.clauseMultiplier || 1.5) : 1.5;
        const dynamicClause = Math.round(price * mult);
        const storedClause = team.clauses?.[player.eaPlayerName] || 0;
        
        // La cláusula real visible/activa en la web:
        const activeClause = Math.max(storedClause, dynamicClause);
        
        const isStarter = (team.lineup?.POR === player.eaPlayerName) ||
            (team.lineup?.DFC || []).includes(player.eaPlayerName) ||
            (team.lineup?.MC || []).includes(player.eaPlayerName) ||
            (team.lineup?.DC || []).includes(player.eaPlayerName);
            
        console.log(`- Liga: "${lName}" | Equipo: "${team.teamName}" (${team.ownerName || team.discordId})`);
        console.log(`  * Alineación: ${isStarter ? 'TITULAR' : 'SUPLENTE'}`);
        console.log(`  * Cláusula en DB: ${storedClause.toLocaleString('es-ES')} €`);
        console.log(`  * Cláusula dinámica de esta liga (Precio × ${mult}): ${dynamicClause.toLocaleString('es-ES')} €`);
        console.log(`  * Cláusula activa (Math.max): ${activeClause.toLocaleString('es-ES')} €`);
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error('[ANALYZE XPETRU] Error:', err);
    process.exit(1);
});
