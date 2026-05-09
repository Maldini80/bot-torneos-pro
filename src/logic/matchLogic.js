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

export async function finalizeMatchThread(client, partido, resultString, delayMs = 10000) {
    if (!partido || !partido.threadId) return;

    try {
        const thread = await client.channels.fetch(partido.threadId).catch(() => null);
        if (thread) {
            const delaySecs = Math.round(delayMs / 1000);
            const finalMessage = `✅ **Resultado final confirmado:** ${partido.equipoA.nombre} **${resultString}** ${partido.equipoB.nombre}.\n\nEste hilo se eliminará automáticamente en ${delaySecs} segundos.`;
            await thread.send(finalMessage);
            await new Promise(resolve => setTimeout(resolve, delayMs));
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

    // Capturar resultado anterior ANTES de sobreescribir (necesario para reversión atómica)
    const oldResultado = partido.resultado || null;

    partido.resultado = resultString;
    partido.status = 'finalizado';

    await updateMatchThreadName(client, partido);

    // Encontramos la ruta exacta del partido para escrituras atómicas
    const matchPath = findMatchPath(currentTournament, matchId);
    if (!matchPath) throw new Error(`Ruta del partido ${matchId} no encontrada en la estructura del torneo.`);

    if (fase === 'grupos') {
        // === ESCRITURA VERDADERAMENTE ATÓMICA con $inc + arrayFilters ===
        // A diferencia de $set del array completo, $inc no necesita leer primero:
        // cada operación incrementa los campos directamente en MongoDB.
        // Esto permite que un capitán y el auto-detector validen partidos del mismo
        // grupo simultáneamente sin pisarse las stats.
        const [golesA, golesB] = resultString.split('-').map(Number);
        const newInc = computeStatsIncrements(golesA, golesB);
        let netA = { ...newInc.teamA };
        let netB = { ...newInc.teamB };

        // Si ya había un resultado previo (admin modificando), calcular el neto
        // (restar incrementos del resultado viejo + sumar incrementos del nuevo)
        if (oldResultado) {
            const [oldGA, oldGB] = oldResultado.split('-').map(Number);
            const oldInc = computeStatsIncrements(oldGA, oldGB);
            for (const key of Object.keys(netA)) {
                netA[key] -= oldInc.teamA[key];
                netB[key] -= oldInc.teamB[key];
            }
        }

        const groupPath = `structure.grupos.${partido.nombreGrupo}.equipos`;

        await db.collection('tournaments').updateOne(
            { _id: currentTournament._id },
            {
                $set: {
                    [`${matchPath}.resultado`]: resultString,
                    [`${matchPath}.status`]: 'finalizado',
                },
                $inc: {
                    [`${groupPath}.$[eqA].stats.pj`]: netA.pj,
                    [`${groupPath}.$[eqA].stats.gf`]: netA.gf,
                    [`${groupPath}.$[eqA].stats.gc`]: netA.gc,
                    [`${groupPath}.$[eqA].stats.dg`]: netA.dg,
                    [`${groupPath}.$[eqA].stats.pts`]: netA.pts,
                    [`${groupPath}.$[eqA].stats.pg`]: netA.pg,
                    [`${groupPath}.$[eqA].stats.pe`]: netA.pe,
                    [`${groupPath}.$[eqA].stats.pp`]: netA.pp,
                    [`${groupPath}.$[eqB].stats.pj`]: netB.pj,
                    [`${groupPath}.$[eqB].stats.gf`]: netB.gf,
                    [`${groupPath}.$[eqB].stats.gc`]: netB.gc,
                    [`${groupPath}.$[eqB].stats.dg`]: netB.dg,
                    [`${groupPath}.$[eqB].stats.pts`]: netB.pts,
                    [`${groupPath}.$[eqB].stats.pg`]: netB.pg,
                    [`${groupPath}.$[eqB].stats.pe`]: netB.pe,
                    [`${groupPath}.$[eqB].stats.pp`]: netB.pp,
                }
            },
            {
                arrayFilters: [
                    { 'eqA.id': partido.equipoA.id },
                    { 'eqB.id': partido.equipoB.id }
                ]
            }
        );

        let updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkAndCreateNextRoundThreads(client, guild, updatedTournamentAfterStats, partido);

        updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkForGroupStageAdvancement(client, guild, updatedTournamentAfterStats);

    } else {
        // Eliminatorias: no hay stats de grupo compartidas, $set simple es seguro
        const atomicUpdate = {
            [`${matchPath}.resultado`]: resultString,
            [`${matchPath}.status`]: 'finalizado'
        };
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: atomicUpdate });
        let updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkForKnockoutAdvancement(client, guild, updatedTournamentAfterStats);
    }

    const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });
    await updatePublicMessages(client, finalTournamentState);
    await updateTournamentManagementThread(client, finalTournamentState);
    await notifyTournamentVisualizer(finalTournamentState);

    // [DESACTIVADO] Encolado automático de estadísticas EA tras cada partido.
    // Ahora las estadísticas profundas solo se descargan bajo demanda con el botón
    // "Forzar Reload Stats EA" del panel de gestión del torneo.
    // El auto-detector de resultados (90s) NO se ve afectado por este cambio.
    /*
    try {
        const { getBotSettings } = await import('../../database.js');
        const globalSettings = await getBotSettings();
        
        if (globalSettings.eaScannerEnabled) {
            const teamACaptainId = partido.equipoA.id;
            const teamBCaptainId = partido.equipoB.id;
            
            const fullTeamA = currentTournament.teams.aprobados[teamACaptainId];
            const fullTeamB = currentTournament.teams.aprobados[teamBCaptainId];
            
            if (fullTeamA && fullTeamA.eaClubId && fullTeamB && fullTeamB.eaClubId) {
                const { addJob } = await import('../utils/eaStatsQueue.js');
                addJob(
                    matchId, 
                    currentTournament.shortId, 
                    matchPath, 
                    fullTeamA.eaClubId, 
                    fullTeamB.eaClubId, 
                    fullTeamA.eaPlatform, 
                    fullTeamB.eaPlatform
                );
            } else {
                console.log(`[EA_QUEUE] Partido ${matchId} ignorado: Al menos uno de los equipos no tiene vinculado un Club de EA.`);
            }
        }
    } catch (eaError) {
        console.error(`[EA_QUEUE] Error al intentar añadir trabajo a la cola:`, eaError);
    }
    */

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

        // --- CORRECCIÓN: Eliminar el hilo del partido simulado (sin esperar los 10s) ---
        finalizeMatchThread(client, processedMatch, resultString);

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

export function findMatchPath(tournament, matchId) {
    for (const groupName in tournament.structure.calendario) {
        const matches = tournament.structure.calendario[groupName];
        const idx = matches.findIndex(p => p.matchId === matchId);
        if (idx !== -1) return `structure.calendario.${groupName}.${idx}`;
    }
    for (const stage of Object.keys(tournament.structure.eliminatorias)) {
        if (stage === 'rondaActual') continue;
        const stageData = tournament.structure.eliminatorias[stage];
        if (!stageData) continue;
        if (Array.isArray(stageData)) {
            const idx = stageData.findIndex(p => p && p.matchId === matchId);
            if (idx !== -1) return `structure.eliminatorias.${stage}.${idx}`;
        } else if (stageData.matchId === matchId) {
            return `structure.eliminatorias.${stage}`;
        }
    }
    return null;
}

/**
 * Calcula los incrementos de stats para ambos equipos dado un resultado.
 * Usado para operaciones atómicas con $inc en MongoDB.
 * Retorna deltas puros que se pueden sumar o restar para reversiones.
 */
function computeStatsIncrements(golesA, golesB) {
    let ptsA = 0, ptsB = 0, pgA = 0, pgB = 0, peA = 0, peB = 0, ppA = 0, ppB = 0;
    if (golesA > golesB) { ptsA = 3; pgA = 1; ppB = 1; }
    else if (golesB > golesA) { ptsB = 3; pgB = 1; ppA = 1; }
    else { ptsA = 1; ptsB = 1; peA = 1; peB = 1; }

    return {
        teamA: { pj: 1, gf: golesA, gc: golesB, dg: golesA - golesB, pts: ptsA, pg: pgA, pe: peA, pp: ppA },
        teamB: { pj: 1, gf: golesB, gc: golesA, dg: golesB - golesA, pts: ptsB, pg: pgB, pe: peB, pp: ppB }
    };
}

// [LEGACY] Se mantiene por compatibilidad pero ya no se usa en processMatchResult.
// La nueva lógica usa computeStatsIncrements + $inc atómico directamente.
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
        equipoA.stats.pg = (equipoA.stats.pg || 0) + 1;
        equipoB.stats.pp = (equipoB.stats.pp || 0) + 1;
    } else if (golesB > golesA) {
        equipoB.stats.pts += 3;
        equipoB.stats.pg = (equipoB.stats.pg || 0) + 1;
        equipoA.stats.pp = (equipoA.stats.pp || 0) + 1;
    } else {
        equipoA.stats.pts += 1;
        equipoB.stats.pts += 1;
        equipoA.stats.pe = (equipoA.stats.pe || 0) + 1;
        equipoB.stats.pe = (equipoB.stats.pe || 0) + 1;
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
    equipoA.stats.gf = Math.max(0, equipoA.stats.gf - oldGolesA);
    equipoB.stats.gf = Math.max(0, equipoB.stats.gf - oldGolesB);
    equipoA.stats.gc = Math.max(0, equipoA.stats.gc - oldGolesB);
    equipoB.stats.gc = Math.max(0, equipoB.stats.gc - oldGolesA);
    equipoA.stats.dg = equipoA.stats.gf - equipoA.stats.gc;
    equipoB.stats.dg = equipoB.stats.gf - equipoB.stats.gc;

    if (oldGolesA > oldGolesB) {
        equipoA.stats.pts = Math.max(0, equipoA.stats.pts - 3);
        equipoA.stats.pg = Math.max(0, (equipoA.stats.pg || 0) - 1);
        equipoB.stats.pp = Math.max(0, (equipoB.stats.pp || 0) - 1);
    }
    else if (oldGolesB > oldGolesA) {
        equipoB.stats.pts = Math.max(0, equipoB.stats.pts - 3);
        equipoB.stats.pg = Math.max(0, (equipoB.stats.pg || 0) - 1);
        equipoA.stats.pp = Math.max(0, (equipoA.stats.pp || 0) - 1);
    }
    else {
        equipoA.stats.pts = Math.max(0, equipoA.stats.pts - 1);
        equipoB.stats.pts = Math.max(0, equipoB.stats.pts - 1);
        equipoA.stats.pe = Math.max(0, (equipoA.stats.pe || 0) - 1);
        equipoB.stats.pe = Math.max(0, (equipoB.stats.pe || 0) - 1);
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
        // [VIGILANTE APAGADO TEMPORALMENTE]
        // Desactivado para evitar condiciones de carrera al guardar resultados, 
        // especialmente en sistema suizo gratuito.
        continue;
        
        // En torneos de pago, NO validamos automáticamente por inactividad.
        // if (tournament.config.isPaid) continue;

        const eliminatoriasRaw = tournament.structure.eliminatorias || {};
        const eliminatoriasMatches = Object.entries(eliminatoriasRaw)
            .filter(([key]) => key !== 'rondaActual')
            .map(([, val]) => Array.isArray(val) ? val : [val])
            .flat();
        const allMatches = [
            ...Object.values(tournament.structure.calendario || {}).flat(),
            ...eliminatoriasMatches
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
