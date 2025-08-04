// src/logic/matchLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS } from '../../config.js';
import { updatePublicMessages, endTournament, notifyTwitterResult, postSimulationUpdateToDiscord } from './tournamentLogic.js';
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
            await thread.delete('Partido finalizado.').catch(() => {});
        }
    } catch (error) {
        if (error.code !== 10003) {
            console.error(`[THREAD-DELETE] No se pudo eliminar el hilo ${partido.threadId} del partido ${partido.matchId}:`, error.message);
        }
    }
}

export async function processMatchResult(client, guild, tournament, matchId, resultString, isSimulation = false) {
    const db = getDb();
    let currentTournament = await db.collection('tournaments').findOne({ _id: tournament._id });

    const { partido, fase } = findMatch(currentTournament, matchId);
    if (!partido) throw new Error(`Partido ${matchId} no encontrado en torneo ${currentTournament.shortId}`);

    if (partido.resultado) {
        await revertStats(currentTournament, partido);
    }
    
    partido.resultado = resultString;
    partido.status = 'finalizado';

    // Siempre actualizamos el nombre del hilo, incluso en simulación
    await updateMatchThreadName(client, partido);
    
    if (fase === 'grupos') {
        await updateGroupStageStats(currentTournament, partido);
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: { "structure": currentTournament.structure } });
        
        let updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        if (!isSimulation) {
            await checkAndCreateNextRoundThreads(client, guild, updatedTournamentAfterStats, partido);
        }
        
        updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkForGroupStageAdvancement(client, guild, updatedTournamentAfterStats, isSimulation);

    } else {
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: { "structure": currentTournament.structure } });
        let updatedTournamentAfterStats = await db.collection('tournaments').findOne({ _id: tournament._id });
        await checkForKnockoutAdvancement(client, guild, updatedTournamentAfterStats, isSimulation);
    }
    
    const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });
    await updatePublicMessages(client, finalTournamentState);
    await updateTournamentManagementThread(client, finalTournamentState);
    
    return partido;
}

export async function simulateAllPendingMatches(client, tournamentShortId) {
    const db = getDb();
    let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!tournament) throw new Error('Torneo no encontrado para simulación');

    const guild = await client.guilds.fetch(tournament.guildId);
    
    let pendingMatches = [];
    
    // --- INICIO DE LA CORRECCIÓN: LÓGICA DE SIMULACIÓN SECUENCIAL ---
    // Determinar qué partidos simular basándose en la fase actual del torneo.
    if (tournament.status === 'fase_de_grupos' && tournament.structure.calendario) {
        pendingMatches = Object.values(tournament.structure.calendario).flat().filter(p => p && (p.status === 'pendiente' || p.status === 'en_curso'));
    } else if (tournament.structure.eliminatorias && tournament.structure.eliminatorias.rondaActual) {
        const currentStage = tournament.structure.eliminatorias.rondaActual;
        const stageData = tournament.structure.eliminatorias[currentStage];
        if (Array.isArray(stageData)) {
            pendingMatches = stageData.filter(p => p && (p.status === 'pendiente' || p.status === 'en_curso'));
        } else if (stageData && typeof stageData === 'object' && (stageData.status === 'pendiente' || stageData.status === 'en_curso')) {
            pendingMatches = [stageData];
        }
    }
    // --- FIN DE LA CORRECCIÓN ---

    if (pendingMatches.length === 0) {
        return { message: 'No hay partidos pendientes para simular en la fase actual.' };
    }

    for (const match of pendingMatches) {
        const golesA = Math.floor(Math.random() * 5);
        const golesB = Math.floor(Math.random() * 5);
        const resultString = `${golesA}-${golesB}`;
        
        let currentTournamentState = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        await processMatchResult(client, guild, currentTournamentState, match.matchId, resultString, true);
    }
    
    return { message: `Se han simulado con éxito ${pendingMatches.length} partidos de la fase actual.`};
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

async function checkForGroupStageAdvancement(client, guild, tournament, isSimulation = false) {
    const allGroupMatches = Object.values(tournament.structure.calendario).flat();
    if (allGroupMatches.length === 0 || tournament.status !== 'fase_de_grupos') return;

    const allFinished = allGroupMatches.every(p => p.status === 'finalizado');
    if (allFinished) {
        console.log(`[ADVANCEMENT] Fase de grupos finalizada para ${tournament.shortId}. Iniciando fase eliminatoria.`);
        if (isSimulation) {
            postSimulationUpdateToDiscord(client, tournament, 'GROUP_STAGE_END', tournament).catch(console.error);
        } else {
            notifyTwitterResult(client, tournament, 'GROUP_STAGE_END', tournament).catch(console.error);
        }
        await startNextKnockoutRound(client, guild, tournament, isSimulation);
    }
}

async function checkForKnockoutAdvancement(client, guild, tournament, isSimulation = false) {
    const rondaActual = tournament.structure.eliminatorias.rondaActual;
    if (!rondaActual) return;

    if (rondaActual === 'final') {
        const finalMatch = tournament.structure.eliminatorias.final;
        if (finalMatch && finalMatch.status === 'finalizado') {
            await handleFinalResult(client, guild, tournament, isSimulation);
        }
        return;
    }

    const partidosRonda = tournament.structure.eliminatorias[rondaActual];
    const allFinished = partidosRonda && partidosRonda.every(p => p && p.status === 'finalizado');

    if (allFinished) {
        console.log(`[ADVANCEMENT] Ronda eliminatoria '${rondaActual}' finalizada para ${tournament.shortId}.`);
        const data = { matches: partidosRonda, stage: rondaActual, tournament };
        if (isSimulation) {
            postSimulationUpdateToDiscord(client, tournament, 'KNOCKOUT_ROUND_COMPLETE', data).catch(console.error);
        } else {
            notifyTwitterResult(client, tournament, 'KNOCKOUT_ROUND_COMPLETE', data).catch(console.error);
        }
        await startNextKnockoutRound(client, guild, tournament, isSimulation);
    }
}

async function startNextKnockoutRound(client, guild, tournament, isSimulation = false) {
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

    let partidos;
    if (indiceRondaActual === -1) {
        const gruposOrdenados = Object.keys(currentTournament.structure.grupos).sort();
        
        if (format.qualifiersPerGroup === 1) {
            const clasificados = [];
            for (const groupName of gruposOrdenados) {
                const grupoOrdenado = [...currentTournament.structure.grupos[groupName].equipos].sort((a,b) => sortTeams(a,b, currentTournament, groupName));
                if (grupoOrdenado[0]) {
                    clasificados.push(JSON.parse(JSON.stringify(grupoOrdenado[0])));
                }
            }
            partidos = crearPartidosEliminatoria(clasificados, siguienteRonda);

        } else if (currentTournament.config.formatId === '8_teams_semis_classic') {
            const grupoA = [...currentTournament.structure.grupos['Grupo A'].equipos].sort((a, b) => sortTeams(a, b, currentTournament, 'Grupo A'));
            const grupoB = [...currentTournament.structure.grupos['Grupo B'].equipos].sort((a, b) => sortTeams(a, b, currentTournament, 'Grupo B'));
            partidos = [
                createMatchObject(null, siguienteRonda, grupoA[0], grupoB[1]),
                createMatchObject(null, siguienteRonda, grupoB[0], grupoA[1])
            ];
        } else {
            const bombo1 = [];
            const bombo2 = [];
            for (const groupName of gruposOrdenados) {
                const grupoOrdenado = [...currentTournament.structure.grupos[groupName].equipos].sort((a,b) => sortTeams(a,b, currentTournament, groupName));
                if (grupoOrdenado[0]) bombo1.push({ team: JSON.parse(JSON.stringify(grupoOrdenado[0])), group: groupName });
                if (format.qualifiersPerGroup > 1 && grupoOrdenado[1]) {
                    bombo2.push({ team: JSON.parse(JSON.stringify(grupoOrdenado[1])), group: groupName });
                }
            }
            partidos = crearPartidosEvitandoMismoGrupo(bombo1, bombo2, siguienteRonda);
        }
    } else {
        const partidosRondaAnterior = currentTournament.structure.eliminatorias[rondaActual];
        const clasificados = partidosRondaAnterior.map(p => {
            const [golesA, golesB] = p.resultado.split('-').map(Number);
            return golesA > golesB ? p.equipoA : p.equipoB;
        });
        partidos = crearPartidosEliminatoria(clasificados, siguienteRonda);
    }

    if (!partidos || partidos.length === 0) {
        console.error(`[FATAL ERROR] No se generaron partidos para la ronda '${siguienteRonda}' del torneo ${currentTournament.shortId}. Abortando avance.`);
        currentTournament.status = rondaActual || 'fase_de_grupos';
        currentTournament.structure.eliminatorias.rondaActual = rondaActual;
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: { "status": currentTournament.status, "structure.eliminatorias.rondaActual": currentTournament.structure.eliminatorias.rondaActual }});
        return;
    }

    if (siguienteRonda === 'final') {
        currentTournament.structure.eliminatorias.final = partidos[0];
    } else {
        currentTournament.structure.eliminatorias[siguienteRonda] = partidos;
    }
    
    const data = { matches: partidos, stage: siguienteRonda, tournament: currentTournament };
    if (isSimulation) {
        postSimulationUpdateToDiscord(client, currentTournament, 'KNOCKOUT_MATCHUPS_CREATED', data).catch(console.error);
    } else {
        notifyTwitterResult(client, currentTournament, 'KNOCKOUT_MATCHUPS_CREATED', data).catch(console.error);
    }

    if (!isSimulation) {
        const infoChannel = await client.channels.fetch(currentTournament.discordChannelIds.infoChannelId).catch(() => null);
        const embedAnuncio = new EmbedBuilder().setColor('#e67e22').setTitle(`🔥 ¡Comienza la Fase de ${siguienteRonda.charAt(0).toUpperCase() + siguienteRonda.slice(1)}! 🔥`).setFooter({text: '¡Mucha suerte!'});

        for(const [i, p] of partidos.entries()) {
            const threadId = await createMatchThread(client, guild, p, currentTournament.discordChannelIds.matchesChannelId, currentTournament.shortId);
            p.threadId = threadId;
            embedAnuncio.addFields({ name: `Enfrentamiento ${i+1}`, value: `> ${p.equipoA.nombre} vs ${p.equipoB.nombre}` });
        }
        if (infoChannel) await infoChannel.send({ embeds: [embedAnuncio] });
    }
    
    await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: currentTournament });
    const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });
    await updatePublicMessages(client, finalTournamentState);
    await updateTournamentManagementThread(client, finalTournamentState);
}

async function handleFinalResult(client, guild, tournament, isSimulation = false) {
    const final = tournament.structure.eliminatorias.final;
    const [golesA, golesB] = final.resultado.split('-').map(Number);
    const campeon = golesA > golesB ? final.equipoA : final.equipoB;
    const finalista = golesA > golesB ? final.equipoB : final.equipoA;
    
    if (!isSimulation) {
        const infoChannel = await client.channels.fetch(tournament.discordChannelIds.infoChannelId).catch(() => null);
        if(infoChannel) {
            const embedCampeon = new EmbedBuilder()
                .setColor('#ffd700')
                .setTitle(`🎉 ¡Tenemos un Campeón! / We Have a Champion! 🎉`)
                .setDescription(`**¡Felicidades a <@${campeon.capitanId}> (${campeon.nombre}) por ganar el torneo ${tournament.nombre}!**`)
                .setThumbnail('https://thumbs.dreamstime.com/b/la-copa-de-f%C3%BAtbol-oro-recompensa-por-victoria-en-el-campeonato-estadio-campo-verde-dorado-lente-multicolor-fondo-premio-deportivo-272109299.jpg')
                .setTimestamp();
            await infoChannel.send({ content: `|| @everyone || <@${campeon.capitanId}>`, embeds: [embedCampeon] });
        }
    }
    
    if (tournament.config.isPaid) {
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (notificationsThread) {
            const embedPagoCampeon = new EmbedBuilder().setColor('#ffd700').setTitle('🏆 PAGO PENDIENTE: CAMPEÓN').addFields({ name: 'Equipo', value: campeon.nombre }, { name: 'Capitán', value: campeon.capitanTag }, { name: 'PayPal a Pagar', value: `\`${campeon.paypal}\`` }, { name: 'Premio', value: `${tournament.config.prizeCampeon}€` });
            const rowCampeon = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_prize_paid:${tournament.shortId}:${campeon.capitanId}:campeon`).setLabel('Marcar Premio Campeón Pagado').setStyle(ButtonStyle.Success).setEmoji('💰')
            );
            await notificationsThread.send({ embeds: [embedPagoCampeon], components: [rowCampeon] });
        
            if (tournament.config.prizeFinalista > 0) {
                const embedPagoFinalista = new EmbedBuilder().setColor('#C0C0C0').setTitle('🥈 PAGO PENDIENTE: FINALISTA').addFields({ name: 'Equipo', value: finalista.nombre }, { name: 'Capitán', value: finalista.capitanTag }, { name: 'PayPal a Pagar', value: `\`${finalista.paypal}\`` }, { name: 'Premio', value: `${tournament.config.prizeFinalista}€` });
                const rowFinalista = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`admin_prize_paid:${tournament.shortId}:${finalista.capitanId}:finalista`).setLabel('Marcar Premio Finalista Pagado').setStyle(ButtonStyle.Success).setEmoji('💰')
                );
                await notificationsThread.send({ embeds: [embedPagoFinalista], components: [rowFinalista] });
            }
        }
    }
    
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });
    const updatedTournament = await db.collection('tournaments').findOne({_id: tournament._id});

    if (isSimulation) {
        postSimulationUpdateToDiscord(client, updatedTournament, 'FINALIZADO', updatedTournament).catch(console.error);
    } else {
        notifyTwitterResult(client, updatedTournament, 'FINALIZADO', updatedTournament).catch(console.error);
    }

    await updateTournamentManagementThread(client, updatedTournament);
    console.log(`[FINISH] El torneo ${tournament.shortId} ha finalizado. Esperando cierre manual por parte de un admin.`);
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

function crearPartidosEvitandoMismoGrupo(bombo1_data, bombo2_data, ronda) {
    const partidos = [];
    for (let i = bombo2_data.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bombo2_data[i], bombo2_data[j]] = [bombo2_data[j], bombo2_data[i]];
    }

    for (const data1 of bombo1_data) {
        let opponentData = null;
        let opponentIndex = -1;

        for (let i = 0; i < bombo2_data.length; i++) {
            if (data1.group !== bombo2_data[i].group) {
                opponentData = bombo2_data[i];
                opponentIndex = i;
                break;
            }
        }

        if (!opponentData && bombo2_data.length > 0) {
            opponentData = bombo2_data[0];
            opponentIndex = 0;
        }
        
        if (opponentData) {
            partidos.push(createMatchObject(null, ronda, data1.team, opponentData.team));
            bombo2_data.splice(opponentIndex, 1);
        }
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
    return Math.random() - 0.5;
}

async function revertStats(tournament, partido) {
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
