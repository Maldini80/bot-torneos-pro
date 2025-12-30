import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS } from '../../config.js';
import {
    updatePublicMessages,
    endTournament,
    notifyTournamentVisualizer,
    checkForGroupStageAdvancement,
    checkForKnockoutAdvancement,
    startNextKnockoutRound,
    handleFinalResult
} from './tournamentLogic.js';
import { createMatchThread, updateMatchThreadName, createMatchObject, checkAndCreateNextRoundThreads } from '../utils/tournamentUtils.js';
import { updateTournamentManagementThread } from '../utils/panelManager.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { postTournamentUpdate } from '../utils/twitter.js';

export async function finalizeMatchThread(client, partido, resultString) {
    if (!partido || !partido.threadId) return;

    try {
        const thread = await client.channels.fetch(partido.threadId).catch(() => null);
        if (thread) {
            const finalMessage = `✅ **Resultado final confirmado:** ${partido.equipoA.nombre} **${resultString}** ${partido.equipoB.nombre}.\n\nEste hilo se eliminará automáticamente en 10 segundos.`;
            await thread.send(finalMessage);
            await new Promise(resolve => setTimeout(resolve, 10000));
            await thread.delete('Partido finalizado.').catch(() => { });
        }
    } catch (error) {
        if (error.code !== 10003) {
            console.error(`[THREAD-DELETE] No se pudo eliminar el hilo ${partido.threadId} del partido ${partido.matchId}:`, error.message);
        }
    }
}

export async function processMatchResult(client, guild, tournament, matchId, resultString) {
    const db = getDb();
    let currentTournament = await db.collection('tournaments').findOne({ _id: tournament._id });

    const { partido, fase } = findMatch(currentTournament, matchId);
    if (!partido) throw new Error(`Partido ${matchId} no encontrado en torneo ${currentTournament.shortId}`);

    // Si ya había un resultado, primero lo revertimos.
    if (partido.resultado) {
        await revertStats(currentTournament, partido);
    }

    partido.resultado = resultString;
    partido.status = 'finalizado';

    await updateMatchThreadName(client, partido);

    if (fase === 'grupos') {
        await updateGroupStageStats(currentTournament, partido);
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: { "structure": currentTournament.structure } });

        let updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkAndCreateNextRoundThreads(client, guild, updatedTournamentAfterStats, partido);

        updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkForGroupStageAdvancement(client, guild, updatedTournamentAfterStats);

    } else {
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: { "structure": currentTournament.structure } });
        let updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkForKnockoutAdvancement(client, guild, updatedTournamentAfterStats);
    }

    const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });
    await updatePublicMessages(client, finalTournamentState);
    await updateTournamentManagementThread(client, finalTournamentState);
    await notifyTournamentVisualizer(finalTournamentState);

    return partido;
}

export async function simulateAllPendingMatches(client, tournamentShortId) {
    const db = getDb();
    let initialTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!initialTournament) throw new Error('Torneo no encontrado para simulación');

    const guild = await client.guilds.fetch(initialTournament.guildId);

    let allMatchesToSimulate = [];
    if (initialTournament.structure.calendario) {
        allMatchesToSimulate.push(...Object.values(initialTournament.structure.calendario).flat());
    }
    if (initialTournament.structure.eliminatorias) {
        for (const stageKey in initialTournament.structure.eliminatorias) {
            if (stageKey === 'rondaActual') continue;
            const stageData = initialTournament.structure.eliminatorias[stageKey];
            if (Array.isArray(stageData)) allMatchesToSimulate.push(...stageData);
            else if (stageData && typeof stageData === 'object' && stageData.matchId) allMatchesToSimulate.push(stageData);
        }
    }

    const pendingMatches = allMatchesToSimulate.filter(p => p && (p.status === 'pendiente' || p.status === 'en_curso'));

    if (pendingMatches.length === 0) {
        return { message: 'No hay partidos pendientes para simular.' };
    }

    let simulatedCount = 0;
    for (const match of pendingMatches) {
        let currentTournamentState = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!currentTournamentState || currentTournamentState.status === 'finalizado') {
            console.log(`[SIMULATION] Simulación detenida porque el torneo ${tournamentShortId} ha finalizado.`);
            break;
        }

        const golesA = Math.floor(Math.random() * 5);
        const golesB = Math.floor(Math.random() * 5);
        const resultString = `${golesA}-${golesB}`;

        const processedMatch = await processMatchResult(client, guild, currentTournamentState, match.matchId, resultString);

        // --- CORRECCIÓN: Eliminar el hilo del partido simulado ---
        await finalizeMatchThread(client, processedMatch, resultString);

        simulatedCount++;
    }

    return { message: `Se han simulado con éxito ${simulatedCount} partidos.` };
}

export function findMatch(tournament, matchId) {
    for (const groupName in tournament.structure.calendario) {
        const match = tournament.structure.calendario[groupName].find(p => p.matchId === matchId);
        if (match) return { partido: match, fase: 'grupos' };
    }
    for (const stage of Object.keys(tournament.structure.eliminatorias)) {
        if (stage === 'rondaActual') continue;
        const stageData = tournament.structure.eliminatorias[stage];
        if (!stageData) continue;
        if (Array.isArray(stageData)) {
            const match = stageData.find(p => p && p.matchId === matchId);
            if (match) return { partido: match, fase: stage };
        } else if (stageData.matchId === matchId) {
            return { partido: stageData, fase: stage };
        }
    }
    return { partido: null, fase: null };
}

async function updateGroupStageStats(tournament, partido) {
    const [golesA, golesB] = partido.resultado.split('-').map(Number);

    const equipoA = tournament.structure.grupos[partido.nombreGrupo].equipos.find(e => e.id === partido.equipoA.id);
    const equipoB = tournament.structure.grupos[partido.nombreGrupo].equipos.find(e => e.id === partido.equipoB.id);

    if (!equipoA || !equipoB) {
        if (partido.equipoA.id !== 'ghost' && partido.equipoB.id !== 'ghost') {
            console.error(`[STATS ERROR] No se encontraron los equipos del partido ${partido.matchId} en el grupo ${partido.nombreGrupo}.`);
        }
        return;
    }

    equipoA.stats.pj += 1;
    equipoB.stats.pj += 1;
    equipoA.stats.gf += golesA;
    equipoB.stats.gf += golesB;
    equipoA.stats.gc += golesB;
    equipoB.stats.gc += golesA;
    equipoA.stats.dg = equipoA.stats.gf - equipoA.stats.gc;
    equipoB.stats.dg = equipoB.stats.gf - equipoB.stats.gc;

    if (golesA > golesB) {
        equipoA.stats.pts += 3;
    } else if (golesB > golesA) {
        equipoB.stats.pts += 3;
    } else {
        equipoA.stats.pts += 1;
        equipoB.stats.pts += 1;
    }
}

export async function revertStats(tournament, partido) {
    if (!partido.nombreGrupo || !partido.resultado) return;

    const [oldGolesA, oldGolesB] = partido.resultado.split('-').map(Number);
    const equipoA = tournament.structure.grupos[partido.nombreGrupo]?.equipos.find(e => e.id === partido.equipoA.id);
    const equipoB = tournament.structure.grupos[partido.nombreGrupo]?.equipos.find(e => e.id === partido.equipoB.id);

    if (!equipoA || !equipoB) return;

    equipoA.stats.pj = Math.max(0, equipoA.stats.pj - 1);
    equipoB.stats.pj = Math.max(0, equipoB.stats.pj - 1);
    equipoA.stats.gf -= oldGolesA;
    equipoB.stats.gf -= oldGolesB;
    equipoA.stats.gc -= oldGolesB;
    equipoB.stats.gc -= oldGolesA;
    equipoA.stats.dg = equipoA.stats.gf - equipoA.stats.gc;
    equipoB.stats.dg = equipoB.stats.gf - equipoB.stats.gc;

    if (oldGolesA > oldGolesB) equipoA.stats.pts -= 3;
    else if (oldGolesB > oldGolesA) equipoB.stats.pts -= 3;
    else {
        equipoA.stats.pts -= 1;
        equipoB.stats.pts -= 1;
    }
}

export async function checkOverdueMatches(client) {
    const db = getDb();
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

    const activeTournaments = await db.collection('tournaments').find({
        status: { $nin: ['finalizado', 'inscripcion_abierta', 'cancelado'] }
    }).toArray();

    if (activeTournaments.length === 0) return;

    for (const tournament of activeTournaments) {
        const allMatches = [
            ...Object.values(tournament.structure.calendario || {}).flat(),
            ...Object.values(tournament.structure.eliminatorias || {}).flat()
        ];

        const guild = await client.guilds.fetch(tournament.guildId).catch(() => null);
        if (!guild) continue;

        for (const match of allMatches) {
            if (!match || !match.reportedScores || typeof match.reportedScores !== 'object') continue;

            const reportKeys = Object.keys(match.reportedScores);

            if (reportKeys.length === 1 && match.status !== 'finalizado' && match.reportedScores[reportKeys[0]].reportedAt < threeMinutesAgo) {

                console.log(`[VIGILANTE] Partido atascado detectado: ${match.matchId} en el torneo ${tournament.shortId}. Validando automáticamente.`);

                const resultString = match.reportedScores[reportKeys[0]].score;

                try {
                    const processedMatch = await processMatchResult(client, guild, tournament, match.matchId, resultString);

                    const thread = await client.channels.fetch(processedMatch.threadId).catch(() => null);
                    if (thread) {
                        await thread.send(`⚠️ **Este partido ha sido validado automáticamente** debido a que uno de los rivales no ha reportado el resultado en el tiempo establecido.`);
                    }
                    await finalizeMatchThread(client, processedMatch, resultString);

                } catch (error) {
                    console.error(`[VIGILANTE] Error al procesar automáticamente el partido ${match.matchId}:`, error);
                }
            }
        }
    }
}
