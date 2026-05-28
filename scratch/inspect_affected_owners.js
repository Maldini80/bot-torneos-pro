import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

const AFFECTED = [
    { name: 'Retromoneybeatz', realPts: 233.5, inflatedPts: 467 },
    { name: 'nestor007', realPts: 104.7, inflatedPts: 209.4 },
    { name: 'xDiiego10#6089', realPts: 268.1, inflatedPts: 514.9 },
    { name: '13alvaro12', realPts: 145.9, inflatedPts: 291.8 },
    { name: 'FrancM2P8', realPts: 120.5, inflatedPts: 225 },
    { name: 'zzRaydenzz', realPts: 92.2, inflatedPts: 127.5 },
    { name: 'not_ven00m', realPts: 97.1, inflatedPts: 194.2 },
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
    const playerColl = db.collection('player_profiles');

    console.log('=== BUSCANDO DUEÑOS Y BASE POINTS DE JUGADORES AFECTADOS ===\n');

    for (const player of AFFECTED) {
        const escaped = player.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const dbPlayer = await playerColl.findOne({ eaPlayerName: { $regex: new RegExp('^' + escaped + '$', 'i') } });
        if (!dbPlayer) {
            console.log(`❌ Jugador ${player.name} no encontrado en player_profiles`);
            continue;
        }

        console.log(`Jugador: ${dbPlayer.eaPlayerName} (VPG Points en DB: ${dbPlayer.stats?.vpgPoints})`);
        
        // Buscar equipos que lo tengan en plantilla
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^' + escaped + '$', 'i') }
        }).toArray();

        if (teams.length === 0) {
            console.log(`  - No pertenece a ningún equipo en ninguna liga.`);
        }

        for (const team of teams) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
            const leagueName = league ? league.name : 'Desconocida';
            const pointsMode = league ? league.pointsMode : 'normal';
            const basePoints = league?.basePoints?.[dbPlayer.eaPlayerName] ?? league?.basePoints?.[dbPlayer.eaPlayerName.toLowerCase()] ?? 'No definida';
            const inLineup = isPlayerInLineup(team.lineup, dbPlayer.eaPlayerName);

            console.log(`  - Liga: ${leagueName} (${pointsMode}) | Equipo: ${team.teamName} (${team.discordUsername})`);
            console.log(`    En Once: ${inLineup ? 'SÍ' : 'NO'} | Base Points de la liga: ${basePoints} | Puntos actuales del equipo: ${team.points}`);
        }
        console.log('');
    }

    await client.close();
}

main().catch(console.error);
