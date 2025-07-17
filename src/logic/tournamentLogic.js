// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, TOURNAMENT_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createTeamListEmbed, createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed } from '../utils/embeds.js';
import { updateTournamentChannelName, updateAdminPanel } from '../utils/panelManager.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType } from 'discord.js';

export async function createNewTournament(client, guild, name, shortId, config) {
    const db = getDb();
    const format = TOURNAMENT_FORMATS[config.formatId];
    if (!format) throw new Error('Formato de torneo inválido.');

    const newTournament = {
        _id: new ObjectId(),
        shortId: shortId,
        guildId: guild.id,
        nombre: name,
        status: 'inscripcion_abierta',
        config: {
            formatId: config.formatId,
            format: format,
            isPaid: config.isPaid,
            prizeCampeon: config.prizeCampeon || 0,
            prizeFinalista: config.prizeFinalista || 0,
            enlacePaypal: config.enlacePaypal || null,
        },
        teams: { pendientes: {}, aprobados: {} },
        structure: { 
            grupos: {}, 
            calendario: {}, 
            eliminatorias: { rondaActual: null }
        },
        discordMessageIds: {
            statusMessageId: null,
            inscriptionMessageId: null,
            matchThreadsParentId: null,
            teamListMessageId: null,
            classificationMessageId: null,
            calendarMessageId: null
        }
    };

    const matchThreadsParent = await guild.channels.create({ name: `⚔️-partidos-${shortId}`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID });
    newTournament.discordMessageIds.matchThreadsParentId = matchThreadsParent.id;
    
    const statusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
    const statusMsg = await statusChannel.send(createTournamentStatusEmbed(newTournament));
    newTournament.discordMessageIds.statusMessageId = statusMsg.id;

    const inscripcionChannel = await client.channels.fetch(CHANNELS.INSCRIPCIONES);
    const inscriptionMsg = await inscripcionChannel.send(createTournamentStatusEmbed(newTournament));
    newTournament.discordMessageIds.inscriptionMessageId = inscriptionMsg.id;
    
    const equiposChannel = await client.channels.fetch(CHANNELS.CAPITANES_INSCRITOS);
    const teamListMsg = await equiposChannel.send(createTeamListEmbed(newTournament));
    newTournament.discordMessageIds.teamListMessageId = teamListMsg.id;
    
    const clasificacionChannel = await client.channels.fetch(CHANNELS.CLASIFICACION);
    const classificationMsg = await clasificacionChannel.send({ embeds: [new EmbedBuilder().setTitle(`📊 Clasificación / Ranking - ${name}`).setDescription('El torneo aún no ha comenzado.')] });
    newTournament.discordMessageIds.classificationMessageId = classificationMsg.id;

    const calendarioChannel = await client.channels.fetch(CHANNELS.CALENDARIO);
    const calendarMsg = await calendarioChannel.send({ embeds: [new EmbedBuilder().setTitle(`🗓️ Calendario / Schedule - ${name}`).setDescription('El calendario se publicará aquí.')] });
    newTournament.discordMessageIds.calendarMessageId = calendarMsg.id;

    await db.collection('tournaments').insertOne(newTournament);
    await updateAdminPanel(client);
    console.log(`[INFO] Nuevo torneo "${name}" creado y anunciado.`);
    return newTournament;
}

export async function startGroupStage(client, guild, tournament) {
    if (tournament.status !== 'inscripcion_abierta') return;
    tournament.status = 'fase_de_grupos';
    const format = tournament.config.format;
    let teams = Object.values(tournament.teams.aprobados);
    for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[teams[i], teams[j]] = [teams[j], teams[i]]; }
    
    const grupos = {};
    const numGrupos = format.groups;
    const tamanoGrupo = format.size / numGrupos;
    for (let i = 0; i < teams.length; i++) {
        const grupoIndex = Math.floor(i / tamanoGrupo);
        const nombreGrupo = `Grupo ${String.fromCharCode(65 + grupoIndex)}`;
        if (!grupos[nombreGrupo]) grupos[nombreGrupo] = { equipos: [] };
        teams[i].stats = { pj: 0, pts: 0, gf: 0, gc: 0, dg: 0 };
        grupos[nombreGrupo].equipos.push(teams[i]);
    }
    tournament.structure.grupos = grupos;

    const calendario = {};
    for (const nombreGrupo in grupos) {
        const equiposGrupo = grupos[nombreGrupo].equipos;
        calendario[nombreGrupo] = [];
        if (equiposGrupo.length === 4) { // Lógica para grupos de 4
            const [t1, t2, t3, t4] = equiposGrupo;
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 1, t1, t2), createMatchObject(nombreGrupo, 1, t3, t4));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 2, t1, t3), createMatchObject(nombreGrupo, 2, t2, t4));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 3, t1, t4), createMatchObject(nombreGrupo, 3, t2, t3));
        } // Añadir más lógicas para otros tamaños de grupo si es necesario
    }
    tournament.structure.calendario = calendario;

    for (const nombreGrupo in calendario) {
        for (const partido of calendario[nombreGrupo].filter(p => p.jornada === 1)) {
            const threadId = await createMatchThread(client, guild, partido, tournament);
            partido.threadId = threadId;
            partido.status = 'en_curso';
        }
    }

    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: tournament });
    await updatePublicMessages(client, tournament);
    await updateTournamentChannelName(client);
    await updateAdminPanel(client);
    console.log(`[INFO] Sorteo realizado para el torneo: ${tournament.nombre}`);
}

export async function approveTeam(client, tournament, teamData) {
    if (!tournament.teams.aprobados) tournament.teams.aprobados = {};
    tournament.teams.aprobados[teamData.capitanId] = teamData;
    if (tournament.teams.pendientes[teamData.capitanId]) delete tournament.teams.pendientes[teamData.capitanId];
    
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: {
        'teams.aprobados': tournament.teams.aprobados,
        'teams.pendientes': tournament.teams.pendientes
    }});
    
    const guild = await client.guilds.fetch(tournament.guildId);
    await updatePublicMessages(client, await db.collection('tournaments').findOne({_id: tournament._id}));
    
    const teamCount = Object.keys(tournament.teams.aprobados).length;
    if (teamCount === tournament.config.format.size) {
        console.log(`[INFO] ¡Cupo lleno para ${tournament.nombre}! Iniciando sorteo.`);
        await startGroupStage(client, guild, tournament);
    }
}

export async function endTournament(client, tournament) {
    console.log(`[LOGIC] Iniciando finalización para el torneo: ${tournament.shortId}`);
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });
    await cleanupTournament(client, tournament);
    await updateTournamentChannelName(client);
    await updateAdminPanel(client);
    console.log(`[LOGIC] Finalización completada para el torneo: ${tournament.shortId}`);
}

async function cleanupTournament(client, tournament) {
    console.log(`[CLEANUP] Iniciando limpieza para el torneo ${tournament.shortId}`);
    const { discordMessageIds, guildId } = tournament;
    const deletionPromises = [];
    
    const addDeletionTask = async (channelId, messageId) => {
        if (!channelId || !messageId) return;
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            deletionPromises.push(message.delete());
        } catch (err) {
            console.warn(`No se pudo borrar el mensaje ${messageId}: ${err.message}`);
        }
    };

    await addDeletionTask(CHANNELS.TORNEOS_STATUS, discordMessageIds.statusMessageId);
    await addDeletionTask(CHANNELS.INSCRIPCIONES, discordMessageIds.inscriptionMessageId);
    await addDeletionTask(CHANNELS.CAPITANES_INSCRITOS, discordMessageIds.teamListMessageId);
    await addDeletionTask(CHANNELS.CLASIFICACION, discordMessageIds.classificationMessageId);
    await addDeletionTask(CHANNELS.CALENDARIO, discordMessageIds.calendarMessageId);
    
    if (discordMessageIds.matchThreadsParentId) {
        try {
            const channel = await client.channels.fetch(discordMessageIds.matchThreadsParentId);
            deletionPromises.push(channel.delete('Torneo finalizado.'));
        } catch (err) {
            console.warn(`No se pudo borrar el canal ${discordMessageIds.matchThreadsParentId}: ${err.message}`);
        }
    }

    await Promise.allSettled(deletionPromises);
    console.log(`[CLEANUP] Tareas de limpieza para ${tournament.shortId} completadas.`);
}

export async function updatePublicMessages(client, tournament) {
    const db = getDb();
    const latestTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!latestTournamentState || latestTournamentState.status === 'finalizado') return;

    console.log(`[UPDATE] Actualizando mensajes para ${latestTournamentState.shortId}`);
    const editMessage = async (channelId, messageId, content) => {
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            await message.edit(content);
        } catch (e) {
            console.warn(`[WARN] Falla al actualizar mensaje ${messageId} en ${channelId}: ${e.message}`);
        }
    };

    const updateTasks = [
        editMessage(CHANNELS.TORNEOS_STATUS, latestTournamentState.discordMessageIds.statusMessageId, createTournamentStatusEmbed(latestTournamentState)),
        editMessage(CHANNELS.INSCRIPCIONES, latestTournamentState.discordMessageIds.inscriptionMessageId, createTournamentStatusEmbed(latestTournamentState)),
        editMessage(CHANNELS.CAPITANES_INSCRITOS, latestTournamentState.discordMessageIds.teamListMessageId, createTeamListEmbed(latestTournamentState)),
    ];
    
    if (latestTournamentState.status !== 'inscripcion_abierta') {
        updateTasks.push(editMessage(CHANNELS.CLASIFICACION, latestTournamentState.discordMessageIds.classificationMessageId, createClassificationEmbed(latestTournamentState)));
        updateTasks.push(editMessage(CHANNELS.CALENDARIO, latestTournamentState.discordMessageIds.calendarMessageId, createCalendarEmbed(latestTournamentState)));
    }
    
    await Promise.allSettled(updateTasks);
}
