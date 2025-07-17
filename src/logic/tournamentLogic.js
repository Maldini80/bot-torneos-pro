// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, TOURNAMENT_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createTeamListEmbed, createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed } from '../utils/embeds.js';
import { updateTournamentChannelName } from '../utils/panelManager.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType } from 'discord.js';

// La función createNewTournament necesita guardar un ID de mensaje más: el de inscripción.
export async function createNewTournament(client, guild, name, shortId, config) {
    const db = getDb();
    const format = TOURNAMENT_FORMATS[config.formatId];
    if (!format) throw new Error('Formato de torneo inválido.');

    const newTournament = {
        _id: new ObjectId(), shortId, guildId: guild.id, nombre: name,
        status: 'inscripcion_abierta',
        config: { formatId, format, isPaid: config.isPaid, prizeCampeon: config.prizeCampeon || 0, prizeFinalista: config.prizeFinalista || 0, enlacePaypal: config.enlacePaypal || null, },
        teams: { pendientes: {}, aprobados: {} },
        structure: { grupos: {}, calendario: {}, eliminatorias: {} },
        discordMessageIds: {
            statusMessageId: null, inscriptionMessageId: null, // <-- ID añadido
            matchThreadsParentId: null, teamListMessageId: null,
            classificationMessageId: null, calendarMessageId: null
        }
    };

    const matchThreadsParent = await guild.channels.create({ name: `⚔️-partidos-${shortId}`, type: ChannelType.GuildText, parent: '1394444274623582358' });
    newTournament.discordMessageIds.matchThreadsParentId = matchThreadsParent.id;

    const statusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
    const statusMsg = await statusChannel.send(createTournamentStatusEmbed(newTournament));
    newTournament.discordMessageIds.statusMessageId = statusMsg.id;
    
    // CORRECCIÓN: Ahora guardamos el ID del mensaje de inscripción
    const inscripcionChannel = await client.channels.fetch(CHANNELS.INSCRIPCIONES);
    const inscriptionMsg = await inscripcionChannel.send(createTournamentStatusEmbed(newTournament)); // Reutilizamos el embed de estado
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
    console.log(`[INFO] Nuevo torneo "${name}" creado y anunciado.`);
    return newTournament;
}

// startGroupStage y approveTeam se mantienen igual
export async function startGroupStage(client, guild, tournament) { /* ...código sin cambios... */ }
export async function approveTeam(client, tournament, teamData) { /* ...código sin cambios... */ }

// --- NUEVA FUNCIÓN DE LIMPIEZA ---
async function cleanupTournament(client, tournament) {
    console.log(`[CLEANUP] Iniciando limpieza para el torneo ${tournament.shortId}`);
    const { discordMessageIds, guildId } = tournament;
    const deletionPromises = [];

    const addDeletionTask = (channelId, messageId) => {
        if (channelId && messageId) {
            deletionPromises.push(
                client.channels.fetch(channelId)
                    .then(channel => channel.messages.fetch(messageId))
                    .then(message => message.delete())
                    .catch(err => console.warn(`No se pudo borrar el mensaje ${messageId}: ${err.message}`))
            );
        }
    };
    
    // Añadir todas las tareas de borrado de mensajes
    addDeletionTask(CHANNELS.TORNEOS_STATUS, discordMessageIds.statusMessageId);
    addDeletionTask(CHANNELS.INSCRIPCIONES, discordMessageIds.inscriptionMessageId);
    addDeletionTask(CHANNELS.CAPITANES_INSCRITOS, discordMessageIds.teamListMessageId);
    addDeletionTask(CHANNELS.CLASIFICACION, discordMessageIds.classificationMessageId);
    addDeletionTask(CHANNELS.CALENDARIO, discordMessageIds.calendarMessageId);

    // Añadir la tarea de borrado del canal de partidos
    if (discordMessageIds.matchThreadsParentId) {
        deletionPromises.push(
            client.channels.fetch(discordMessageIds.matchThreadsParentId)
                .then(channel => channel.delete('Torneo finalizado.'))
                .catch(err => console.warn(`No se pudo borrar el canal ${discordMessageIds.matchThreadsParentId}: ${err.message}`))
        );
    }
    
    // Esperamos a que todas las promesas se completen (fallen o no)
    await Promise.allSettled(deletionPromises);
    console.log(`[CLEANUP] Tareas de limpieza para ${tournament.shortId} completadas.`);
}


// --- VERSIÓN CORREGIDA Y MEJORADA DE endTournament ---
export async function endTournament(client, tournament) {
    console.log(`[LOGIC] Iniciando finalización para el torneo: ${tournament.shortId}`);
    
    // 1. Marcar como finalizado en la base de datos
    tournament.status = 'finalizado';
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });
    
    // 2. Llamar a la nueva función de limpieza
    await cleanupTournament(client, tournament);
    
    // 3. Actualizar el título del canal de estado
    await updateTournamentChannelName(client);
    
    console.log(`[LOGIC] Finalización completada para el torneo: ${tournament.shortId}`);
}

// La función updatePublicMessages ahora es más simple
export async function updatePublicMessages(client, tournament) {
    const db = getDb();
    const latestTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!latestTournamentState || latestTournamentState.status === 'finalizado') return;

    console.log(`[UPDATE] Actualizando mensajes para ${latestTournamentState.shortId}`);
    const updateTasks = [
        client.channels.fetch(CHANNELS.TORNEOS_STATUS).then(c => c.messages.fetch(latestTournamentState.discordMessageIds.statusMessageId).then(m => m.edit(createTournamentStatusEmbed(latestTournamentState)))),
        client.channels.fetch(CHANNELS.CAPITANES_INSCRITOS).then(c => c.messages.fetch(latestTournamentState.discordMessageIds.teamListMessageId).then(m => m.edit(createTeamListEmbed(latestTournamentState)))),
    ];
    if (latestTournamentState.status !== 'inscripcion_abierta') {
        updateTasks.push(client.channels.fetch(CHANNELS.CLASIFICACION).then(c => c.messages.fetch(latestTournamentState.discordMessageIds.classificationMessageId).then(m => m.edit(createClassificationEmbed(latestTournamentState)))));
        updateTasks.push(client.channels.fetch(CHANNELS.CALENDARIO).then(c => c.messages.fetch(latestTournamentState.discordMessageIds.calendarMessageId).then(m => m.edit(createCalendarEmbed(latestTournamentState)))));
    }
    await Promise.allSettled(updateTasks).catch(e => console.warn(`[WARN] Falla parcial al actualizar mensajes públicos para ${latestTournamentState.shortId}: ${e.message}`));
}
