import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
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
    
    const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
    const leaguesMap = new Map(leagues.map(l => [l._id.toString(), l]));

    const teams = await db.collection('fantasy_teams').find({ approved: true }).toArray();
    
    const startSync = new Date('2026-05-27T07:20:00.000Z');
    const endSync = new Date('2026-05-27T07:45:00.000Z');
    const buggyRewards = await db.collection('fantasy_news').find({
        type: 'reward',
        createdAt: { $gte: startSync, $lte: endSync }
    }).toArray();

    const buggyTeamNames = new Set();
    for (const n of buggyRewards) {
        const teamName = n.metadata?.teamName || (n.message.match(/💰 (.*?) recibe/) || n.message.match(/El equipo \*\*(.*?)\*\*/))?.[1];
        if (teamName) buggyTeamNames.add(teamName.trim().toLowerCase());
    }

    const results = [];

    for (const team of teams) {
        const league = leaguesMap.get(team.leagueId);
        if (!league) continue;

        const teamNameLower = team.teamName.trim().toLowerCase();
        if (!buggyTeamNames.has(teamNameLower)) continue;

        let teamExcessPoints = 0;
        const playersContributed = [];

        for (const p of AFFECTED) {
            if (team.players && team.players.some(name => name.toLowerCase() === p.name.toLowerCase())) {
                const inLineup = isPlayerInLineup(team.lineup, p.name);
                if (inLineup) {
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

                    if (boughtAfterSync) continue;

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
            // Al calcular la simulación, mostramos los puntos que tenía antes de la corrección avanzada.
            // Para reconstruir el estado anterior (el de la tabla), le sumamos el exceso al valor actual.
            const currentPoints = team.points || 0;
            const originalPoints = Math.round((currentPoints + teamExcessPoints) * 10) / 10;

            results.push({
                leagueName: league.name,
                teamName: team.teamName,
                discordUsername: team.discordUsername,
                currentPoints: originalPoints,
                correctedPoints: currentPoints,
                excessPoints: teamExcessPoints,
                players: playersContributed
            });
        }
    }

    results.sort((a, b) => b.excessPoints - a.excessPoints);

    let md = `# Simulación de Corrección de Puntos (Versión Definitiva)\n\n`;
    md += `Este documento contiene la simulación exacta y definitiva del impacto del bug de duplicación de estadísticas en los puntos de los equipos de las ligas Fantasy en modo **ZERO**.\n\n`;
    md += `> [!IMPORTANT]\n`;
    md += `> Esta corrección es ultra precisa y **excluye** a los equipos que no puntuaron en el sync buggy de las 07:32 (como *Mataratas fc* y *Climent*, que recibieron compensaciones correctas a posteriori) y a los jugadores fichados por cláusula o mercado después del sync.\n`;
    md += `> De acuerdo con las instrucciones, **el presupuesto (dinero) se ha mantenido intacto** y no ha sido modificado.\n\n`;
    
    md += `### Resumen de la Corrección Aplicada\n`;
    md += `- **Equipos corregidos:** ${results.length}\n`;
    const totalPts = results.reduce((acc, r) => acc + r.excessPoints, 0);
    md += `- **Total de puntos restados:** ${totalPts.toFixed(1)} pts\n\n`;

    md += `### Detalle de Correcciones por Equipo\n\n`;
    md += `| Liga | Equipo (Manager) | Jugadores Afectados | Puntos |\n`;
    md += `|---|---|---|---|\n`;

    for (const r of results) {
        const playersStr = r.players.map(p => `${p.name} (+${p.diff})`).join(', ');
        const ptsStr = `${r.currentPoints} → **${r.correctedPoints}** (-${r.excessPoints})`;
        md += `| ${r.leagueName} | ${r.teamName} (${r.discordUsername}) | ${playersStr} | ${ptsStr} |\n`;
    }

    const artifactPath = 'C:/Users/Jose/.gemini/antigravity/brain/103a6787-8182-41f6-8801-64a4928e306b/compensation_simulation.md';
    fs.writeFileSync(artifactPath, md, 'utf-8');
    console.log(`Markdown generado en ${artifactPath}`);

    await client.close();
}

main().catch(console.error);
