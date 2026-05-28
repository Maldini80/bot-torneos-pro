import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

const AFFECTED = [
    { name: 'Retromoneybeatz', realPts: 233.5, inflatedPts: 467, diff: 233.5 },
    { name: 'nestor007', realPts: 104.7, inflatedPts: 209.4, diff: 104.7 },
    { name: 'xDiiego10#6089', realPts: 268.1, inflatedPts: 514.9, diff: 246.8 },
    { name: '13alvaro12', realPts: 145.9, inflatedPts: 291.8, diff: 145.9 },
    { name: 'FrancM2P8', realPts: 120.5, inflatedPts: 225, diff: 104.5 },
    { name: 'zzRaydenzz', realPts: 92.2, inflatedPts: 127.5, diff: 35.3 },
    { name: 'not_ven00m', realPts: 97.1, inflatedPts: 194.2, diff: 97.1 },
];

function isPlayerInLineup(lineup, playerName) {
    if (!lineup || !playerName) return false;
    const nameLower = playerName.toLowerCase();
    if (lineup.POR && lineup.POR.toLowerCase() === nameLower) return true;
    for (const pos of ['DFC', 'MC', 'DC', 'CARR']) {
        if (Array.isArray(lineup[pos]) && lineup[pos].some(p => p && p.toLowerCase() === nameLower)) return true;
    }
    return false;
}

async function main() {
    const EXECUTE = process.argv.includes('--execute');
    console.log(EXECUTE ? '=== EJECUCIÓN: CORRECCIÓN PRECIOSA DE PUNTOS ===\n' : '=== SIMULACIÓN: CORRECCIÓN PRECIOSA DE PUNTOS ===\n');

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
    const leaguesMap = new Map(leagues.map(l => [l._id.toString(), l]));

    const teams = await db.collection('fantasy_teams').find({ approved: true }).toArray();
    
    // Obtener todas las noticias de recompensas del sync buggy
    const startSync = new Date('2026-05-27T07:20:00.000Z');
    const endSync = new Date('2026-05-27T07:45:00.000Z');
    const buggyRewards = await db.collection('fantasy_news').find({
        type: 'reward',
        createdAt: { $gte: startSync, $lte: endSync }
    }).toArray();

    // Crear un set con los teamNames que recibieron recompensas en ese sync
    const buggyTeamNames = new Set();
    for (const n of buggyRewards) {
        const teamName = n.metadata?.teamName || (n.message.match(/💰 (.*?) recibe/) || n.message.match(/El equipo \*\*(.*?)\*\*/))?.[1];
        if (teamName) buggyTeamNames.add(teamName.trim().toLowerCase());
    }

    let totalTeamsCorrected = 0;
    let totalPointsRestados = 0;

    for (const team of teams) {
        const league = leaguesMap.get(team.leagueId);
        if (!league) continue; // Solo ligas zero

        // Regla 1: ¿Recibió recompensa en el sync buggy?
        const teamNameLower = team.teamName.trim().toLowerCase();
        if (!buggyTeamNames.has(teamNameLower)) {
            continue; // Si no recibió recompensa en ese sync, no tiene puntos del bug
        }

        let teamExcessPoints = 0;
        const playersContributed = [];

        for (const p of AFFECTED) {
            if (team.players && team.players.some(name => name.toLowerCase() === p.name.toLowerCase())) {
                const inLineup = isPlayerInLineup(team.lineup, p.name);
                if (inLineup) {
                    // Regla 2: ¿Compró al jugador después del sync?
                    // Buscar si hay una noticia de fichaje del jugador para este equipo después del sync
                    const escapedPlayer = p.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const boughtAfterSync = await db.collection('fantasy_news').findOne({
                        leagueId: team.leagueId,
                        type: { $in: ['fichaje', 'clausulazo'] },
                        createdAt: { $gt: endSync },
                        $or: [
                            { message: { $regex: new RegExp(escapedPlayer, 'i') } },
                            { message: { $regex: new RegExp(team.teamName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') } }
                        ]
                    });

                    if (boughtAfterSync) {
                        console.log(`[INFO] Saltando jugador ${p.name} para ${team.teamName} porque fue fichado después del sync.`);
                        continue; // No sumó de más por este jugador
                    }

                    teamExcessPoints += p.diff;
                    playersContributed.push({
                        name: p.name,
                        diff: p.diff
                    });
                }
            }
        }

        if (teamExcessPoints > 0) {
            teamExcessPoints = Math.round(teamExcessPoints * 10) / 10;
            const currentPoints = team.points || 0;
            const correctedPoints = Math.round(Math.max(0, currentPoints - teamExcessPoints) * 10) / 10;

            totalTeamsCorrected++;
            totalPointsRestados += teamExcessPoints;

            console.log(`Liga: ${league.name}`);
            console.log(`Equipo: ${team.teamName} (${team.discordUsername})`);
            console.log(`  Jugadores afectados: ${playersContributed.map(p => `${p.name} (+${p.diff} pts)`).join(', ')}`);
            console.log(`  Puntos: ${currentPoints} -> ${correctedPoints} (-${teamExcessPoints} pts)`);

            if (EXECUTE) {
                // 1. Actualizar puntos en DB
                await db.collection('fantasy_teams').updateOne(
                    { _id: team._id },
                    { $set: { points: correctedPoints } }
                );

                // 2. Registrar noticia
                const newsMsg = `🔧 **CORRECCIÓN JORNADA**: Se han recalculado los puntos del equipo **${team.teamName}** restando **${teamExcessPoints}** pts por el bug de duplicación de estadísticas de jugadores multi-liga (${playersContributed.map(p => p.name).join(', ')}). El presupuesto no ha sido modificado.`;
                await db.collection('fantasy_news').insertOne({
                    leagueId: team.leagueId,
                    type: 'reward',
                    message: newsMsg,
                    metadata: {
                        teamName: team.teamName,
                        discordId: team.discordId,
                        pointsCorrected: -teamExcessPoints,
                        players: playersContributed.map(p => p.name),
                        timestamp: new Date().toISOString()
                    },
                    createdAt: new Date()
                });
                console.log(`  [DB] Cambios aplicados.`);
            }
            console.log('----------------------------------------------------');
        }
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`Equipos corregidos: ${totalTeamsCorrected}`);
    console.log(`Total puntos restados: ${totalPointsRestados.toFixed(1)} pts`);

    await client.close();
}

main().catch(console.error);
