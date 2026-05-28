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
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    
    console.log('=== CALCULO DE EXCESO DE PUNTOS Y SALDO POR EQUIPO ===\n');

    const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
    const leaguesMap = new Map(leagues.map(l => [l._id.toString(), l]));

    const teams = await db.collection('fantasy_teams').find({ approved: true }).toArray();
    const results = [];

    for (const team of teams) {
        const league = leaguesMap.get(team.leagueId);
        if (!league) continue; // Solo ligas modo zero

        let teamExcessPoints = 0;
        const playersContributed = [];

        for (const p of AFFECTED) {
            // Verificar si el jugador pertenece a este equipo y estuvo en su once titular
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
            const currentBalance = team.balance || 0;
            
            const correctedPoints = Math.round(Math.max(0, currentPoints - teamExcessPoints) * 10) / 10;
            const excessBalance = teamExcessPoints * 80000;
            const correctedBalance = currentBalance - excessBalance;

            results.push({
                leagueName: league.name,
                teamName: team.teamName,
                discordUsername: team.discordUsername,
                currentPoints,
                correctedPoints,
                excessPoints: teamExcessPoints,
                currentBalance,
                correctedBalance,
                excessBalance,
                players: playersContributed
            });
        }
    }

    // Mostrar los resultados en una tabla ordenada por puntos de exceso
    results.sort((a, b) => b.excessPoints - a.excessPoints);

    console.log(`Se encontraron ${results.length} equipos con exceso de puntos.\n`);
    
    for (const r of results) {
        console.log(`Liga: ${r.leagueName}`);
        console.log(`Equipo: ${r.teamName} (${r.discordUsername})`);
        console.log(`  Jugadores afectados: ${r.players.map(p => `${p.name} (+${p.diff} pts)`).join(', ')}`);
        console.log(`  Puntos:   ${r.currentPoints} -> ${r.correctedPoints} (Diferencia: -${r.excessPoints} pts)`);
        console.log(`  Presupuesto: ${r.currentBalance.toLocaleString()} € -> ${r.correctedBalance.toLocaleString()} € (Diferencia: -${r.excessBalance.toLocaleString()} €)`);
        console.log('----------------------------------------------------');
    }

    await client.close();
}

main().catch(console.error);
