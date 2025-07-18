// src/logic/matchLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS } from '../../config.js';
import { updatePublicMessages, endTournament } from './tournamentLogic.js';
import { createMatchThread, updateMatchThreadName, createMatchObject, checkAndCreateNextRoundThreads } from '../utils/tournamentUtils.js';
import { updateTournamentManagementThread } from '../utils/panelManager.js';
import { EmbedBuilder } from 'discord.js';

export async function processMatchResult(client, guild, tournament, matchId, resultString) {
    const db = getDb();
    let currentTournament = await db.collection('tournaments').findOne({ _id: tournament._id });

    const { partido, fase } = findMatch(currentTournament, matchId);
    if (!partido) throw new Error(`Partido ${matchId} no encontrado en torneo ${currentTournament.shortId}`);

    if (partido.resultado) {
        await revertStats(currentTournament, partido);
    }
    
    partido.resultado = resultString;
    partido.status = 'finalizado';

    await updateMatchThreadName(client, partido);

    if (fase === 'grupos') {
        await updateGroupStageStats(currentTournament, partido);
        // Guardamos el estado parcial para que las siguientes funciones lean los datos actualizados
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: { "structure": currentTournament.structure } });
        
        let updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkAndCreateNextRoundThreads(client, guild, updatedTournamentAfterStats, partido);
        
        // Volvemos a leer por si la función anterior hizo cambios
        updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkForGroupStageAdvancement(client, guild, updatedTournamentAfterStats);

    } else { // Si es fase eliminatoria
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: { "structure": currentTournament.structure } });
        let updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkForKnockoutAdvancement(client, guild, updatedTournamentAfterStats);
    }
    
    const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });
    await updatePublicMessages(client, finalTournamentState);
    await updateTournamentManagementThread(client, finalTournamentState);
}

export async function simulateAllPendingMatches(client, tournamentShortId) {
    const db = getDb();
    let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!tournament) throw new Error('Torneo no encontrado para simulación');

    const guild = await client.guilds.fetch(tournament.guildId);
    
    let allMatches = [];
    if (tournament.structure.calendario) {
        allMatches.push(...Object.values(tournament.structure.calendario).flat());
    }
    if (tournament.structure.eliminatorias) {
        for (const stageKey in tournament.structure.eliminatorias) {
            if (stageKey === 'rondaActual') continue;
            const stageData = tournament.structure.eliminatorias[stageKey];
            if (Array.isArray(stageData)) {
                allMatches.push(...stageData);
            } else if (stageData && typeof stageData === 'object' && stageData.matchId) {
                allMatches.push(stageData);
            }
        }
    }
    
    const pendingMatches = allMatches.filter(p => p && (p.status === 'pendiente' || p.status === 'en_curso'));

    if (pendingMatches.length === 0) {
        return { message: 'No hay partidos pendientes para simular.' };
    }

    for (const match of pendingMatches) {
        const golesA = Math.floor(Math.random() * 5);
        const golesB = Math.floor(Math.random() * 5);
        const resultString = `${golesA}-${golesB}`;
        
        let currentTournamentState = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        await processMatchResult(client, guild, currentTournamentState, match.matchId, resultString);
    }
    
    return { message: `Se han simulado con éxito ${pendingMatches.length} partidos.`};
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

    if (!equipoA || !equipoB) return;

    equipoA.stats.pj += 1;
    equipoB.stats.pj += 1;
    equipoA.stats.gf += golesA;
    equipoB.stats.gf += golesB;
    equipoA.stats.gc += golesB;
    equipoB.stats.gc += golesA;
    equipoA.stats.dg = equipoA.stats.gf - equipoA.stats.gc;
    equipoB.stats.dg = equipoB.stats.gf - equipoB.stats.gc;

    if (golesA > golesB) equipoA.stats.pts += 3;
    else if (golesB > golesA) equipoB.stats.pts += 3;
    else {
        equipoA.stats.pts += 1;
        equipoB.stats.pts += 1;
    }
}

async function checkForGroupStageAdvancement(client, guild, tournament) {
    const allGroupMatches = Object.values(tournament.structure.calendario).flat();
    if (allGroupMatches.length === 0 || tournament.status !== 'fase_de_grupos') return;

    const allFinished = allGroupMatches.every(p => p.status === 'finalizado');
    if (allFinished) {
        console.log(`[ADVANCEMENT] Fase de grupos finalizada para ${tournament.shortId}. Iniciando fase eliminatoria.`);
        await startNextKnockoutRound(client, guild, tournament);
    }
}

async function checkForKnockoutAdvancement(client, guild, tournament) {
    const rondaActual = tournament.structure.eliminatorias.rondaActual;
    if (!rondaActual) return;

    if (rondaActual === 'final') {
        const finalMatch = tournament.structure.eliminatorias.final;
        if (finalMatch && finalMatch.status === 'finalizado') {
            await handleFinalResult(client, guild, tournament);
        }
        return;
    }

    const partidosRonda = tournament.structure.eliminatorias[rondaActual];
    const allFinished = partidosRonda && partidosRonda.every(p => p && p.status === 'finalizado');

    if (allFinished) {
        console.log(`[ADVANCEMENT] Ronda eliminatoria '${rondaActual}' finalizada para ${tournament.shortId}.`);
        await startNextKnockoutRound(client, guild, tournament);
    }
}

async function startNextKnockoutRound(client, guild, tournament) {
    const db = getDb();
    let currentTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    
    const format = currentTournament.config.format;
    const rondaActual = currentTournament.structure.eliminatorias.rondaActual;
    const indiceRondaActual = rondaActual ? format.knockoutStages.indexOf(rondaActual) : -1;
    const siguienteRonda = format.knockoutStages[indiceRondaActual + 1];

    if (!siguienteRonda) {
        console.log(`[ADVANCEMENT] No hay más rondas eliminatorias para ${tournament.shortId}.`);
        return;
    }
    if (currentTournament.status === siguienteRonda) return;

    currentTournament.status = siguienteRonda;
    currentTournament.structure.eliminatorias.rondaActual = siguienteRonda;

    let clasificados = [];
    if (indiceRondaActual === -1) {
        const gruposOrdenados = Object.keys(currentTournament.structure.grupos).sort();
        for (const groupName of gruposOrdenados) {
            const grupoOrdenado = [...currentTournament.structure.grupos[groupName].equipos].sort((a,b) => sortTeams(a,b, currentTournament, groupName));
            const clasificadosDelGrupo = grupoOrdenado.slice(0, format.qualifiersPerGroup);
            clasificados.push(...JSON.parse(JSON.stringify(clasificadosDelGrupo)));
        }
    } else {
        const partidosRondaAnterior = currentTournament.structure.eliminatorias[rondaActual];
        clasificados = partidosRondaAnterior.map(p => {
            const [golesA, golesB] = p.resultado.split('-').map(Number);
            return golesA > golesB ? p.equipoA : p.equipoB;
        });
    }

    const partidos = crearPartidosEliminatoria(clasificados, siguienteRonda);
    if (siguienteRonda === 'final') {
        currentTournament.structure.eliminatorias.final = partidos[0];
    } else {
        currentTournament.structure.eliminatorias[siguienteRonda] = partidos;
    }

    const infoChannel = await client.channels.fetch(currentTournament.discordChannelIds.infoChannelId).catch(() => null);
    const embedAnuncio = new EmbedBuilder().setColor('#e67e22').setTitle(`🔥 ¡Comienza la Fase de ${siguienteRonda.charAt(0).toUpperCase() + siguienteRonda.slice(1)}! 🔥`).setFooter({text: '¡Mucha suerte!'});

    for(const [i, p] of partidos.entries()) {
        // CORRECCIÓN CRÍTICA: Pasamos los parámetros correctos (IDs en lugar de objetos).
        const threadId = await createMatchThread(client, guild, p, currentTournament.discordChannelIds.matchesChannelId, currentTournament.shortId);
        p.threadId = threadId;
        embedAnuncio.addFields({ name: `Enfrentamiento ${i+1}`, value: `> ${p.equipoA.nombre} vs ${p.equipoB.nombre}` });
    }
    if (infoChannel) await infoChannel.send({ embeds: [embedAnuncio] });
    
    await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: currentTournament });
    const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });
    await updatePublicMessages(client, finalTournamentState);
    await updateTournamentManagementThread(client, finalTournamentState);
    await updateTournamentChannelName(client);
}

async function handleFinalResult(client, guild, tournament) {
    const final = tournament.structure.eliminatorias.final;
    const [golesA, golesB] = final.resultado.split('-').map(Number);
    const campeon = golesA > golesB ? final.equipoA : final.equipoB;
    const finalista = golesA > golesB ? final.equipoB : final.equipoA;
    
    const infoChannel = await client.channels.fetch(tournament.discordChannelIds.infoChannelId).catch(() => null);
    if(infoChannel) {
        const embedCampeon = new EmbedBuilder().setColor('#ffd700').setTitle(`🎉 ¡Tenemos un Campeón! / We Have a Champion! 🎉`).setDescription(`**¡Felicidades a ${campeon.nombre} por ganar el torneo ${tournament.nombre}!**`).setThumbnail('https://i.imgur.com/C5mJg1s.png').setTimestamp();
        await infoChannel.send({ content: `|| @everyone ||`, embeds: [embedCampeon] });
    }
    
    if (tournament.config.isPaid) {
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (notificationsThread) {
            const embedPagoCampeon = new EmbedBuilder().setColor('#ffd700').setTitle('🏆 PAGO PENDIENTE: CAMPEÓN').addFields({ name: 'Equipo', value: campeon.nombre }, { name: 'Capitán', value: campeon.capitanTag }, { name: 'PayPal a Pagar', value: `\`${campeon.paypal}\`` }, { name: 'Premio', value: `${tournament.config.prizeCampeon}€` });
            await notificationsThread.send({ embeds: [embedPagoCampeon] });
        
            if (tournament.config.prizeFinalista > 0) {
                const embedPagoFinalista = new EmbedBuilder().setColor('#C0C0C0').setTitle('🥈 PAGO PENDIENTE: FINALISTA').addFields({ name: 'Equipo', value: finalista.nombre }, { name: 'Capitán', value: finalista.capitanTag }, { name: 'PayPal a Pagar', value: `\`${finalista.paypal}\`` }, { name: 'Premio', value: `${tournament.config.prizeFinalista}€` });
                await notificationsThread.send({ embeds: [embedPagoFinalista] });
            }
        }
    }

    await endTournament(client, tournament);
}

function crearPartidosEliminatoria(equipos, ronda) {
    let partidos = [];
    for (let i = equipos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [equipos[i], equipos[j]] = [equipos[j], equipos[i]];
    }

    for(let i = 0; i < equipos.length; i += 2) {
        if (!equipos[i] || !equipos[i+1]) continue;
        const partido = createMatchObject(null, ronda, equipos[i], equipos[i+1]);
        partidos.push(partido);
    }
    return partidos;
}

function sortTeams(a, b, tournament, groupName) {
    if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
    if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
    if (a.stats.gf !== b.stats.gf) return b.stats.gf - a.stats.gf;
    
    const enfrentamiento = tournament.structure.calendario[groupName]?.find(p => 
        p.resultado && 
        ((p.equipoA.id === a.id && p.equipoB.id === b.id) || (p.equipoA.id === b.id && p.equipoB.id === a.id))
    );

    if (enfrentamiento) {
        const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
        if (enfrentamiento.equipoA.id === a.id) {
            if (golesA > golesB) return -1;
            if (golesB > golesA) return 1;
        } else {
            if (golesB > golesA) return -1;
            if (golesA > golesB) return 1;
        }
    }
    return 0;
}

async function revertStats(tournament, partido) {
    if (!partido.nombreGrupo || !partido.resultado) return;
    
    const [oldGolesA, oldGolesB] = partido.resultado.split('-').map(Number);
    const equipoA = tournament.structure.grupos[partido.nombreGrupo]?.equipos.find(e => e.id === partido.equipoA.id);
    const equipoB = tournament.structure.grupos[partido.nombreGrupo]?.equipos.find(e => e.id === partido.equipoB.id);
    
    if (!equipoA || !equipoB) return;

    equipoA.stats.pj -= 1;
    equipoB.stats.pj -= 1;
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
