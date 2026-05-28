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
    console.log(EXECUTE ? '=== MODO EJECUCIÓN: CORRIGIENDO PUNTOS SOLAMENTE ===\n' : '=== MODO SIMULACIÓN (DRY RUN): CORREGIR PUNTOS SOLAMENTE ===\n');

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
    const leaguesMap = new Map(leagues.map(l => [l._id.toString(), l]));

    const teams = await db.collection('fantasy_teams').find({ approved: true }).toArray();
    
    let totalTeamsAffected = 0;
    let totalPointsSubtracted = 0;

    for (const team of teams) {
        const league = leaguesMap.get(team.leagueId);
        if (!league) continue; // Solo ligas zero

        let teamExcessPoints = 0;
        const playersContributed = [];

        for (const p of AFFECTED) {
            if (team.players && team.players.some(name => name.toLowerCase() === p.name.toLowerCase())) {
                const inLineup = isPlayerInLineup(team.lineup, p.name);
                if (inLineup) {
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

            totalTeamsAffected++;
            totalPointsSubtracted += teamExcessPoints;

            console.log(`Liga: ${league.name}`);
            console.log(`Equipo: ${team.teamName} (${team.discordUsername})`);
            console.log(`  Jugadores afectados: ${playersContributed.map(p => `${p.name} (+${p.diff} pts)`).join(', ')}`);
            console.log(`  Puntos:      ${currentPoints} -> ${correctedPoints} (-${teamExcessPoints} pts)`);
            console.log(`  Presupuesto: (SE MANTIENE INTACTO): ${team.balance?.toLocaleString()} €`);

            if (EXECUTE) {
                // 1. Actualizar SOLO puntos del equipo
                await db.collection('fantasy_teams').updateOne(
                    { _id: team._id },
                    {
                        $set: {
                            points: correctedPoints
                        }
                    }
                );

                // 2. Registrar noticia en fantasy_news sin mencionar dinero
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
                console.log(`  [DB] Puntos actualizados y noticia registrada.`);
            }
            console.log('----------------------------------------------------');
        }
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`Equipos afectados: ${totalTeamsAffected}`);
    console.log(`Total puntos a restar: ${totalPointsSubtracted.toFixed(1)} pts`);
    
    await client.close();
}

main().catch(console.error);
