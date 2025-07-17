// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, TOURNAMENT_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createTeamListEmbed, createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed } from '../utils/embeds.js';
import { updateTournamentChannelName } from '../utils/panelManager.js';
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
            formatId: config.formatId, format: format, isPaid: config.isPaid,
            prizeCampeon: config.prizeCampeon || 0, prizeFinalista: config.prizeFinalista || 0,
            enlacePaypal: config.enlacePaypal || null,
        },
        teams: { pendientes: {}, aprobados: {} },
        structure: { grupos: {}, calendario: {}, eliminatorias: {} },
        discordMessageIds: {
            statusMessageId: null, matchThreadsParentId: null, teamListMessageId: null,
            classificationMessageId: null, calendarMessageId: null
        }
    };
    const matchThreadsParent = await guild.channels.create({
        name: `⚔️-partidos-${shortId}`,
        type: ChannelType.GuildText,
        parent: '1394444274623582358',
    });
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
    console.log(`[INFO] Nuevo torneo "${name}" creado y anunciado.`);
    return newTournament;
}

export async function startGroupStage(client, guild, tournament) {
    if (tournament.status !== 'inscripcion_abierta') return;
    tournament.status = 'fase_de_grupos';
    const format = tournament.config.format;
    let teams = Object.values(tournament.teams.aprobados);
    for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[teams[i], teams[j]] = [teams[j], teams[i]]; }
    const grupos = {}, numGrupos = format.groups, tamanoGrupo = format.size / numGrupos;
    for (let i = 0; i < teams.length; i++) {
        const grupoIndex = Math.floor(i / tamanoGrupo), nombreGrupo = `Grupo ${String.fromCharCode(65 + grupoIndex)}`;
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
    console.log(`[INFO] Sorteo realizado para el torneo: ${tournament.nombre}`);
}

export async function approveTeam(client, tournament, teamData) {
    if (!tournament.teams.aprobados) tournament.teams.aprobados = {};
    tournament.teams.aprobados[teamData.capitanId] = teamData;
    if (tournament.teams.pendientes[teamData.capitanId]) delete tournament.teams.pendientes[teamData.capitanId];
    
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: tournament });
    await updatePublicMessages(client, tournament);
    
    const teamCount = Object.keys(tournament.teams.aprobados).length;
    if (teamCount === tournament.config.format.size) {
        console.log(`[INFO] ¡Cupo lleno para ${tournament.nombre}! Iniciando sorteo.`);
        const guild = await client.guilds.fetch(tournament.guildId);
        await startGroupStage(client, guild, tournament);
    }
}

export async function endTournament(client, tournament) {
    console.log(`[LOGIC] Iniciando finalización para el torneo: ${tournament.shortId}`);
    tournament.status = 'finalizado';
    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });
    
    try {
        const clasificacionChannel = await client.channels.fetch(CHANNELS.CLASIFICACION);
        const classificationMessage = await clasificacionChannel.messages.fetch(tournament.discordMessageIds.classificationMessageId);
        await classificationMessage.delete();
        const calendarioChannel = await client.channels.fetch(CHANNELS.CALENDARIO);
        const calendarMessage = await calendarioChannel.messages.fetch(tournament.discordMessageIds.calendarMessageId);
        await calendarMessage.delete();
        console.log(`[LOGIC] Mensajes de clasificación y calendario para ${tournament.shortId} borrados.`);
    } catch(e) {
        console.warn(`[WARN] No se pudieron borrar los mensajes de un torneo finalizado (${tournament.shortId}): ${e.message}`);
    }

    await updatePublicMessages(client, tournament, true);
    await updateTournamentChannelName(client);
    
    console.log(`[LOGIC] Finalización completada para el torneo: ${tournament.shortId}`);
}

export async function updatePublicMessages(client, tournament, isFinalizing = false) {
    const db = getDb();
    const latestTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!latestTournamentState) return;

    console.log(`[UPDATE] Actualizando mensajes para ${latestTournamentState.shortId}`);

    try {
        const statusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        const statusMessage = await statusChannel.messages.fetch(latestTournamentState.discordMessageIds.statusMessageId);
        await statusMessage.edit(createTournamentStatusEmbed(latestTournamentState));
    } catch (e) { console.warn(`[WARN] Falla al actualizar mensaje de estado para ${latestTournamentState.shortId}: ${e.message}`); }

    try {
        const teamsChannel = await client.channels.fetch(CHANNELS.CAPITANES_INSCRITOS);
        const teamListMessage = await teamsChannel.messages.fetch(latestTournamentState.discordMessageIds.teamListMessageId);
        await teamListMessage.edit(createTeamListEmbed(latestTournamentState));
    } catch (e) { console.warn(`[WARN] Falla al actualizar lista de equipos para ${latestTournamentState.shortId}: ${e.message}`); }
    
    if (!isFinalizing) {
        if (latestTournamentState.status !== 'inscripcion_abierta') {
            try {
                const classificationChannel = await client.channels.fetch(CHANNELS.CLASIFICACION);
                const classificationMessage = await classificationChannel.messages.fetch(latestTournamentState.discordMessageIds.classificationMessageId);
                await classificationMessage.edit(createClassificationEmbed(latestTournamentState));
            } catch (e) { console.warn(`[WARN] Falla al actualizar clasificación para ${latestTournamentState.shortId}: ${e.message}`); }
            
            try {
                const calendarChannel = await client.channels.fetch(CHANNELS.CALENDARIO);
                const calendarMessage = await calendarChannel.messages.fetch(latestTournamentState.discordMessageIds.calendarMessageId);
                await calendarMessage.edit(createCalendarEmbed(latestTournamentState));
            } catch (e) { console.warn(`[WARN] Falla al actualizar calendario para ${latestTournamentState.shortId}: ${e.message}`); }
        }
    }
     console.log(`[UPDATE] Actualización de mensajes para ${latestTournamentState.shortId} completada.`);
}
