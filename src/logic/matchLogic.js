// src/logic/matchLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS } from '../../config.js';
import { updatePublicMessages, endTournament } from './tournamentLogic.js';
import { createMatchThread, updateMatchThreadName, createMatchObject } from '../utils/tournamentUtils.js';
import { EmbedBuilder } from 'discord.js';

export async function processMatchResult(client, guild, tournament, matchId, resultString) {
    const { partido, fase } = findMatch(tournament, matchId);
    if (!partido) throw new Error(`Partido ${matchId} no encontrado en torneo ${tournament.shortId}`);

    if (partido.resultado) await revertStats(tournament, partido);
    
    partido.resultado = resultString;
    partido.status = 'finalizado';

    await updateMatchThreadName(client, partido);

    if (fase === 'grupos') {
        await updateGroupStageStats(tournament, partido);
        await checkForGroupStageAdvancement(client, guild, tournament);
    } else {
        await checkForKnockoutAdvancement(client, guild, tournament);
    }

    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: tournament });
    await updatePublicMessages(client, tournament);
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
    const allFinished = partidosRonda && partidosRonda.every(p => p.status === 'finalizado');

    if (allFinished) {
        await startNextKnockoutRound(client, guild, tournament);
    }
}

async function startNextKnockoutRound(client, guild, tournament) {
    const format = tournament.config.format;
    const rondaActual = tournament.structure.eliminatorias.rondaActual;
    const indiceRondaActual = rondaActual ? format.knockoutStages.indexOf(rondaActual) : -1;
    const siguienteRonda = format.knockoutStages[indiceRondaActual + 1];

    if (!siguienteRonda) return;

    tournament.status = siguienteRonda;
    tournament.structure.eliminatorias.rondaActual = siguienteRonda;

    let clasificados = [];
    if (indiceRondaActual === -1) {
        const gruposOrdenados = Object.keys(tournament.structure.grupos).sort();
        for (const groupName of gruposOrdenados) {
            const grupoOrdenado = [...tournament.structure.grupos[groupName].equipos].sort((a,b) => sortTeams(a,b, tournament, groupName));
            const clasificadosDelGrupo = grupoOrdenado.slice(0, format.qualifiersPerGroup);
            clasificados.push(...JSON.parse(JSON.stringify(clasificadosDelGrupo)));
        }
    } else {
        const partidosRondaAnterior = tournament.structure.eliminatorias[rondaActual];
        clasificados = partidosRondaAnterior.map(p => {
            const [golesA, golesB] = p.resultado.split('-').map(Number);
            return golesA > golesB ? p.equipoA : p.equipoB;
        });
    }

    const partidos = crearPartidosEliminatoria(clasificados, siguienteRonda);
    if (siguienteRonda === 'final') {
        tournament.structure.eliminatorias.final = partidos[0];
    } else {
        tournament.structure.eliminatorias[siguienteRonda] = partidos;
    }

    const clasifChannel = await client.channels.fetch(tournament.discordMessageIds.classificationMessageId).catch(() => null);
    const embedAnuncio = new EmbedBuilder().setColor('#e67e22').setTitle(`🔥 ¡Comienza la Fase de ${siguienteRonda.charAt(0).toUpperCase() + siguienteRonda.slice(1)}! 🔥`).setFooter({text: '¡Mucha suerte!'});

    for(const [i, p] of partidos.entries()) {
        const threadId = await createMatchThread(guild, p, tournament);
        p.threadId = threadId;
        embedAnuncio.addFields({ name: `Enfrentamiento ${i+1}`, value: `> ${p.equipoA.nombre} vs ${p.equipoB.nombre}` });
    }
    if (clasifChannel) await clasifChannel.send({ embeds: [embedAnuncio] });
}

async function handleFinalResult(client, guild, tournament) {
    const final = tournament.structure.eliminatorias.final;
    const [golesA, golesB] = final.resultado.split('-').map(Number);
    const campeon = golesA > golesB ? final.equipoA : final.equipoB;
    const finalista = golesA > golesB ? final.equipoB : final.equipoA;
    
    const embedCampeon = new EmbedBuilder().setColor('#ffd700').setTitle(`🎉 ¡Tenemos un Campeón! / We Have a Champion! 🎉`).setDescription(`**¡Felicidades a ${campeon.nombre} por ganar el torneo ${tournament.nombre}!**`).setThumbnail('https://i.imgur.com/C5mJg1s.png').setTimestamp();
    const clasifChannel = await client.channels.fetch(tournament.discordMessageIds.classificationMessageId).catch(() => null);
    if(clasifChannel) await clasifChannel.send({ content: `|| @everyone ||`, embeds: [embedCampeon] });
    
    if (tournament.config.isPaid) {
        const adminChannel = await client.channels.fetch(CHANNELS.ADMIN_APPROVALS);
        const embedPagoCampeon = new EmbedBuilder().setColor('#ffd700').setTitle('🏆 PAGO PENDIENTE: CAMPEÓN / PENDING PAYMENT: CHAMPION').addFields({ name: 'Equipo / Team', value: campeon.nombre }, { name: 'Capitán / Captain', value: campeon.capitanTag }, { name: 'PayPal a Pagar / PayPal to Pay', value: `\`${campeon.paypal}\`` }, { name: 'Premio / Prize', value: `${tournament.config.prizeCampeon}€` });
        await adminChannel.send({ embeds: [embedPagoCampeon] });
        
        if (tournament.config.prizeFinalista > 0) {
            const embedPagoFinalista = new EmbedBuilder().setColor('#C0C0C0').setTitle('🥈 PAGO PENDIENTE: FINALISTA / PENDING PAYMENT: RUNNER-UP').addFields({ name: 'Equipo / Team', value: finalista.nombre }, { name: 'Capitán / Captain', value: finalista.capitanTag }, { name: 'PayPal a Pagar / PayPal to Pay', value: `\`${finalista.paypal}\`` }, { name: 'Premio / Prize', value: `${tournament.config.prizeFinalista}€` });
            await adminChannel.send({ embeds: [embedPagoFinalista] });
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
    const enfrentamiento = tournament.structure.calendario[groupName].find(p => (p.equipoA.id === a.id && p.equipoB.id === b.id) || (p.equipoA.id === b.id && p.equipoB.id === a.id));
    if (enfrentamiento && enfrentamiento.resultado) {
        const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
        if (enfrentamiento.equipoA.id === a.id) { if (golesA > golesB) return -1; if (golesB > golesA) return 1; }
        else { if (golesB > golesA) return -1; if (golesA > golesB) return 1; }
    }
    return 0;
}

async function revertStats(tournament, partido) {
    if (!partido.nombreGrupo) return;
    const [oldGolesA, oldGolesB] = partido.resultado.split('-').map(Number);
    const equipoA = tournament.structure.grupos[partido.nombreGrupo].equipos.find(e => e.id === partido.equipoA.id);
    const equipoB = tournament.structure.grupos[partido.nombreGrupo].equipos.find(e => e.id === partido.equipoB.id);
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
