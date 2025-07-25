// src/logic/matchLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS } from '../../config.js';
import { updatePublicMessages, endTournament } from './tournamentLogic.js';
import { createMatchThread, updateMatchThreadName, createMatchObject, checkAndCreateNextRoundThreads } from '../utils/tournamentUtils.js';
import { updateTournamentManagementThread, updateTournamentChannelName } from '../utils/panelManager.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function processMatchResult(client, guild, tournament, matchId, resultString) {
    const db = getDb();
    let currentTournament = await db.collection('tournaments').findOne({ _id: tournament._id });

    const { partido, fase } = findMatch(currentTournament, matchId);
    if (!partido) throw new Error(`Partido ${matchId} no encontrado en torneo ${currentTournament.shortId}`);

    // Capturar el ID del hilo ANTES de que se pueda perder la referencia al partido
    const threadIdToDelete = partido.threadId;

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

    } else { // Si es fase eliminatoria
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: { "structure": currentTournament.structure } });
        let updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkForKnockoutAdvancement(client, guild, updatedTournamentAfterStats);
    }
    
    const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });
    await updatePublicMessages(client, finalTournamentState);
    await updateTournamentManagementThread(client, finalTournamentState);

    // --- NUEVO: Eliminar el hilo del partido una vez que todo ha sido procesado ---
    if (threadIdToDelete) {
        try {
            const thread = await client.channels.fetch(threadIdToDelete);
            if(thread) await thread.delete('Partido finalizado y procesado.');
        } catch (error) {
            if (error.code !== 10003) { // 10003 = Unknown Channel (ya fue borrado)
                console.error(`[THREAD DELETE] No se pudo borrar el hilo ${threadIdToDelete}:`, error);
            }
        }
    }
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
    const formatId = currentTournament.config.formatId;
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

    let partidos = [];

    // --- LÓGICA DE EMPAREJAMIENTO ACTUALIZADA ---
    if (indiceRondaActual === -1) { // Lógica para la PRIMERA ronda eliminatoria (post-grupos)
        const clasificadosPorPuesto = { primeros: [], segundos: [] };
        const gruposOrdenados = Object.keys(currentTournament.structure.grupos).sort();

        for (const groupName of gruposOrdenados) {
            const grupo = currentTournament.structure.grupos[groupName];
            const equiposOrdenados = [...grupo.equipos].sort((a,b) => sortTeams(a,b, currentTournament, groupName));
            
            const primerClasificado = JSON.parse(JSON.stringify(equiposOrdenados[0]));
            primerClasificado.sourceGroup = groupName; // Guardamos el grupo de origen
            clasificadosPorPuesto.primeros.push(primerClasificado);

            if (format.qualifiersPerGroup > 1) {
                const segundoClasificado = JSON.parse(JSON.stringify(equiposOrdenados[1]));
                segundoClasificado.sourceGroup = groupName;
                clasificadosPorPuesto.segundos.push(segundoClasificado);
            }
        }
        
        // --- CASOS ESPECIALES CON BRACKETS FIJOS O SEMI-FIJOS ---
        if (formatId === '8_teams_semis_classic') {
            const team1A = clasificadosPorPuesto.primeros.find(t => t.sourceGroup === 'Grupo A');
            const team1B = clasificadosPorPuesto.primeros.find(t => t.sourceGroup === 'Grupo B');
            const team2A = clasificadosPorPuesto.segundos.find(t => t.sourceGroup === 'Grupo A');
            const team2B = clasificadosPorPuesto.segundos.find(t => t.sourceGroup === 'Grupo B');
            
            partidos.push(createMatchObject(null, siguienteRonda, team1A, team2B));
            partidos.push(createMatchObject(null, siguienteRonda, team1B, team2A));

        } else if (['16_teams_quarters_new', '32_teams_ro16'].includes(formatId)) {
            let bombo1 = clasificadosPorPuesto.primeros;
            let bombo2 = clasificadosPorPuesto.segundos;
            
            // Barajamos ambos bombos para asegurar aleatoriedad en los cruces
            for (let i = bombo1.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bombo1[i], bombo1[j]] = [bombo1[j], bombo1[i]]; }
            for (let i = bombo2.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bombo2[i], bombo2[j]] = [bombo2[j], bombo2[i]]; }

            for (let i = 0; i < bombo1.length; i++) {
                partidos.push(createMatchObject(null, siguienteRonda, bombo1[i], bombo2[i]));
            }
        } else { // Para todos los demás casos, sorteo puro
            let clasificados = [...clasificadosPorPuesto.primeros, ...clasificadosPorPuesto.segundos];
            partidos = crearPartidosEliminatoriaSorteoPuro(clasificados, siguienteRonda);
        }

    } else { // Lógica para rondas posteriores (ej. semis desde cuartos) -> Sorteo puro
        const partidosRondaAnterior = currentTournament.structure.eliminatorias[rondaActual];
        let clasificados = partidosRondaAnterior.map(p => {
            const [golesA, golesB] = p.resultado.split('-').map(Number);
            return golesA > golesB ? p.equipoA : p.equipoB;
        });
        partidos = crearPartidosEliminatoriaSorteoPuro(clasificados, siguienteRonda);
    }
    
    if (siguienteRonda === 'final') {
        currentTournament.structure.eliminatorias.final = partidos[0];
    } else {
        currentTournament.structure.eliminatorias[siguienteRonda] = partidos;
    }

    const infoChannel = await client.channels.fetch(currentTournament.discordChannelIds.infoChannelId).catch(() => null);
    const embedAnuncio = new EmbedBuilder().setColor('#e67e22').setTitle(`🔥 ¡Comienza la Fase de ${siguienteRonda.charAt(0).toUpperCase() + siguienteRonda.slice(1)}! 🔥`).setFooter({text: '¡Mucha suerte!'});

    for(const [i, p] of partidos.entries()) {
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
        // --- NUEVO: Mencionar al capitán ganador ---
        const embedCampeon = new EmbedBuilder().setColor('#ffd700').setTitle(`🎉 ¡Tenemos un Campeón! / We Have a Champion! 🎉`).setDescription(`**¡Felicidades a ${campeon.nombre} (<@${campeon.capitanId}>) por ganar el torneo ${tournament.nombre}!**`).setThumbnail('https://i.imgur.com/C5mJg1s.png').setTimestamp();
        await infoChannel.send({ content: `|| @everyone ||`, embeds: [embedCampeon] });
    }
    
    if (tournament.config.isPaid) {
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (notificationsThread) {
            // --- NUEVO: Botón para notificar pago ---
            const buttonCampeon = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`payment_paid_notification:${campeon.capitanId}:campeon`).setLabel('Notificar Pago a Campeón').setStyle(ButtonStyle.Success)
            );
            const embedPagoCampeon = new EmbedBuilder().setColor('#ffd700').setTitle('🏆 PAGO PENDIENTE: CAMPEÓN').addFields({ name: 'Equipo', value: campeon.nombre }, { name: 'Capitán', value: campeon.capitanTag }, { name: 'PayPal a Pagar', value: `\`${campeon.paypal}\`` }, { name: 'Premio', value: `${tournament.config.prizeCampeon}€` });
            await notificationsThread.send({ embeds: [embedPagoCampeon], components: [buttonCampeon] });
        
            if (tournament.config.prizeFinalista > 0) {
                 const buttonFinalista = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`payment_paid_notification:${finalista.capitanId}:finalista`).setLabel('Notificar Pago a Finalista').setStyle(ButtonStyle.Success)
                );
                const embedPagoFinalista = new EmbedBuilder().setColor('#C0C0C0').setTitle('🥈 PAGO PENDIENTE: FINALISTA').addFields({ name: 'Equipo', value: finalista.nombre }, { name: 'Capitán', value: finalista.capitanTag }, { name: 'PayPal a Pagar', value: `\`${finalista.paypal}\`` }, { name: 'Premio', value: `${tournament.config.prizeFinalista}€` });
                await notificationsThread.send({ embeds: [embedPagoFinalista], components: [buttonFinalista] });
            }
        }
    }
    
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });
    await updateTournamentChannelName(client);
    const updatedTournament = await db.collection('tournaments').findOne({_id: tournament._id});
    await updateTournamentManagementThread(client, updatedTournament);
    console.log(`[FINISH] El torneo ${tournament.shortId} ha finalizado. Esperando cierre manual por parte de un admin.`);
}

function crearPartidosEliminatoriaSorteoPuro(equipos, ronda) {
    let partidos = [];
    // Barajar la lista de equipos (algoritmo de Fisher-Yates)
    for (let i = equipos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [equipos[i], equipos[j]] = [equipos[j], equipos[i]];
    }

    // Crear partidos de dos en dos
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
