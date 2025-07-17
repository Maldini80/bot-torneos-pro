// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, TOURNAMENT_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createTeamListEmbed, createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed } from '../utils/embeds.js';
import { updateTournamentChannelName, updateAdminPanel } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType } from 'discord.js';

export async function createNewTournament(client, guild, name, shortId, config) {
    setBotBusy(true);
    await updateAdminPanel(client);
    
    try {
        const db = getDb();
        const format = TOURNAMENT_FORMATS[config.formatId];
        if (!format) throw new Error(`Formato de torneo inválido: ${config.formatId}`);
        
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
                entryFee: config.entryFee || 0,
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
                teamListMessageId: null,
                classificationMessageId: null,
                calendarMessageId: null,
                matchThreadsParentId: null,
            }
        };

        const matchThreadsParent = await guild.channels.create({ name: `⚔️-${shortId}-partidos-matches`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID });
        newTournament.discordMessageIds.matchThreadsParentId = matchThreadsParent.id;
        
        const statusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        const statusMsg = await statusChannel.send(createTournamentStatusEmbed(newTournament));
        newTournament.discordMessageIds.statusMessageId = statusMsg.id;
    
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
        console.log(`[INFO] Nuevo torneo "${name}" creado y anunciado COMPLETAMENTE.`);

    } catch (error) {
        console.error('[CREATE] OCURRIÓ UN ERROR EN MEDIO DEL PROCESO DE CREACIÓN:', error);
        throw error; 
    } finally {
        console.log('[CREATE] Proceso finalizado. Reseteando estado del bot a "listo".');
        setBotBusy(false);
        await updateAdminPanel(client);
        await updateTournamentChannelName(client);
    }
}

export async function approveTeam(client, tournament, teamData) {
    const db = getDb();
    const latestTournament = await db.collection('tournaments').findOne({_id: tournament._id});
    
    if (!latestTournament.teams.aprobados) latestTournament.teams.aprobados = {};
    latestTournament.teams.aprobados[teamData.capitanId] = teamData;
    if (latestTournament.teams.pendientes[teamData.capitanId]) delete latestTournament.teams.pendientes[teamData.capitanId];

    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: {
        'teams.aprobados': latestTournament.teams.aprobados,
        'teams.pendientes': latestTournament.teams.pendientes
    }});
    
    const guild = await client.guilds.fetch(tournament.guildId);
    await updatePublicMessages(client, latestTournament);
    
    const teamCount = Object.keys(latestTournament.teams.aprobados).length;
    if (teamCount === latestTournament.config.format.size) {
        console.log(`[INFO] ¡Cupo lleno para ${latestTournament.nombre}! Iniciando sorteo.`);
        await startGroupStage(client, guild, latestTournament);
    }
}

export async function endTournament(client, tournament) {
    console.log(`[LOGIC] Iniciando finalización para: ${tournament.shortId}`);
    const db = getDb();

    console.log(`[LOGIC] Marcando torneo como 'finalizado' en la BD...`);
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });

    console.log(`[LOGIC] Actualizando interfaz (panel y canal) para reflejar el estado finalizado...`);
    await updateTournamentChannelName(client);
    await updateAdminPanel(client);

    console.log(`[LOGIC] Iniciando limpieza de recursos en segundo plano...`);
    await cleanupTournament(client, tournament);

    console.log(`[LOGIC] Proceso de finalización completado para: ${tournament.shortId}`);
}

async function cleanupTournament(client, tournament) {
    console.log(`[CLEANUP] Iniciando limpieza de recursos para: ${tournament.shortId}`);
    const { discordMessageIds } = tournament;

    const deleteMessageSafe = async (channelId, messageId, resourceName) => {
        if (!channelId || !messageId) return;
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            await message.delete();
            console.log(`[CLEANUP] ÉXITO al borrar ${resourceName}.`);
        } catch (err) {
            if (err.code !== 10008) console.error(`[CLEANUP] FALLO al borrar ${resourceName}. Error: ${err.message}`);
        }
    };

    const deleteChannelSafe = async (channelId, resourceName) => {
        if (!channelId) return;
        try {
            const channel = await client.channels.fetch(channelId);
            await channel.delete('Torneo finalizado.');
            console.log(`[CLEANUP] ÉXITO al borrar ${resourceName}.`);
        } catch (err) {
            if (err.code !== 10003) console.error(`[CLEANUP] FALLO al borrar ${resourceName}. Error: ${err.message}`);
        }
    };

    await deleteMessageSafe(CHANNELS.TORNEOS_STATUS, discordMessageIds.statusMessageId, 'Mensaje de Estado');
    await deleteMessageSafe(CHANNELS.INSCRIPCIONES, discordMessageIds.inscriptionMessageId, 'Mensaje de Inscripciones'); // Aunque ya no lo usamos, lo dejamos por si hay datos antiguos
    await deleteMessageSafe(CHANNELS.CAPITANES_INSCRITOS, discordMessageIds.teamListMessageId, 'Mensaje de Lista de Equipos');
    await deleteMessageSafe(CHANNELS.CLASIFICACION, discordMessageIds.classificationMessageId, 'Mensaje de Clasificación');
    await deleteMessageSafe(CHANNELS.CALENDARIO, discordMessageIds.calendarMessageId, 'Mensaje de Calendario');
    await deleteChannelSafe(discordMessageIds.matchThreadsParentId, 'Canal de Partidos');

    console.log(`[CLEANUP] Limpieza de recursos completada.`);
}

export async function updatePublicMessages(client, tournament) {
    const db = getDb();
    const latestTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!latestTournamentState) return;

    const editMessage = async (channelId, messageId, content) => {
        if (!channelId || !messageId) return;
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            await message.edit(content);
        } catch (e) {
            if (e.code !== 10008) console.warn(`[WARN] Falla al actualizar mensaje ${messageId} en ${channelId}: ${e.message}`);
        }
    };

    const statusEmbed = createTournamentStatusEmbed(latestTournamentState);
    const updateTasks = [
        editMessage(CHANNELS.TORNEOS_STATUS, latestTournamentState.discordMessageIds.statusMessageId, statusEmbed),
        editMessage(CHANNELS.CAPITANES_INSCRITOS, latestTournamentState.discordMessageIds.teamListMessageId, createTeamListEmbed(latestTournamentState)),
    ];
    
    if (latestTournamentState.status !== 'inscripcion_abierta') {
        updateTasks.push(editMessage(CHANNELS.CLASIFICACION, latestTournamentState.discordMessageIds.classificationMessageId, createClassificationEmbed(latestTournamentState)));
        updateTasks.push(editMessage(CHANNELS.CALENDARIO, latestTournamentState.discordMessageIds.calendarMessageId, createCalendarEmbed(latestTournamentState)));
    }
    
    await Promise.allSettled(updateTasks);
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
        if (equiposGrupo.length === 4) {
            const [t1, t2, t3, t4] = equiposGrupo;
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 1, t1, t2), createMatchObject(nombreGrupo, 1, t3, t4));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 2, t1, t3), createMatchObject(nombreGrupo, 2, t2, t4));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 3, t1, t4), createMatchObject(nombreGrupo, 3, t2, t3));
        }
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
