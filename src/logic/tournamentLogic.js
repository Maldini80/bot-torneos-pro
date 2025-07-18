// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, ARBITRO_ROLE_ID, TOURNAMENT_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed, createTournamentManagementPanel, createTeamListEmbed } from '../utils/embeds.js';
import { updateTournamentChannelName, updateAdminPanel, updateTournamentManagementThread } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function createNewTournament(client, guild, name, shortId, config) {
    await setBotBusy(true);
    try {
        const db = getDb();
        const format = TOURNAMENT_FORMATS[config.formatId];
        if (!format) throw new Error(`Formato de torneo inválido: ${config.formatId}`);
        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);
        if (!arbitroRole) throw new Error("El rol de Árbitro no fue encontrado.");
        const participantsAndStaffPermissions = [ { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] } ];
        const infoChannel = await guild.channels.create({ name: `🏆-${shortId}-info`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] }] });
        const matchesChannel = await guild.channels.create({ name: `⚽-${shortId}-partidos`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });
        const chatChannel = await guild.channels.create({ name: `💬-${shortId}-chat`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });
        const newTournament = {
            _id: new ObjectId(), shortId, guildId: guild.id, nombre: name, status: 'inscripcion_abierta',
            config: { formatId: config.formatId, format, isPaid: config.isPaid, entryFee: config.entryFee || 0, prizeCampeon: config.prizeCampeon || 0, prizeFinalista: config.prizeFinalista || 0, enlacePaypal: config.enlacePaypal || null, startTime: config.startTime || null },
            teams: { pendientes: {}, aprobados: {} },
            structure: { grupos: {}, calendario: {}, eliminatorias: { rondaActual: null } },
            discordChannelIds: { infoChannelId: infoChannel.id, matchesChannelId: matchesChannel.id, chatChannelId: chatChannel.id },
            discordMessageIds: { statusMessageId: null, classificationMessageId: null, calendarMessageId: null, managementThreadId: null, notificationsThreadId: null }
        };
        const globalStatusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        const statusMsg = await globalStatusChannel.send(createTournamentStatusEmbed(newTournament));
        const classificationMsg = await infoChannel.send(createClassificationEmbed(newTournament));
        const calendarMsg = await infoChannel.send(createCalendarEmbed(newTournament));
        newTournament.discordMessageIds.statusMessageId = statusMsg.id;
        newTournament.discordMessageIds.classificationMessageId = classificationMsg.id;
        newTournament.discordMessageIds.calendarMessageId = calendarMsg.id;
        const managementParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT);
        const managementThread = await managementParentChannel.threads.create({ name: `Gestión - ${name.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
        newTournament.discordMessageIds.managementThreadId = managementThread.id;
        const notificationsParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_APPROVALS_PARENT);
        const notificationsThread = await notificationsParentChannel.threads.create({ name: `Avisos - ${name.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
        newTournament.discordMessageIds.notificationsThreadId = notificationsThread.id;
        await db.collection('tournaments').insertOne(newTournament);
        if (arbitroRole) {
            for (const member of arbitroRole.members.values()) {
                await managementThread.members.add(member.id).catch(()=>{});
                await notificationsThread.members.add(member.id).catch(()=>{});
            }
        }
        await managementThread.send(createTournamentManagementPanel(newTournament, true));
    } catch (error) {
        console.error('[CREATE] OCURRIÓ UN ERROR EN MEDIO DEL PROCESO DE CREACIÓN:', error);
        await setBotBusy(false); throw error; 
    } finally {
        await setBotBusy(false); await updateTournamentChannelName(client);
    }
}

export async function approveTeam(client, tournament, teamData) {
    const db = getDb();
    let latestTournament = await db.collection('tournaments').findOne({_id: tournament._id});
    if (!latestTournament.teams.aprobados) latestTournament.teams.aprobados = {};
    latestTournament.teams.aprobados[teamData.capitanId] = teamData;
    if (latestTournament.teams.pendientes[teamData.capitanId]) delete latestTournament.teams.pendientes[teamData.capitanId];
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { 'teams.aprobados': latestTournament.teams.aprobados, 'teams.pendientes': latestTournament.teams.pendientes }});
    try {
        const chatChannel = await client.channels.fetch(latestTournament.discordChannelIds.chatChannelId);
        await chatChannel.permissionOverwrites.edit(teamData.capitanId, { ViewChannel: true, SendMessages: true });
        await chatChannel.send(`👋 ¡Bienvenido, <@${teamData.capitanId}>! (${teamData.nombre})`);
        const matchesChannel = await client.channels.fetch(latestTournament.discordChannelIds.matchesChannelId);
        await matchesChannel.permissionOverwrites.edit(teamData.capitanId, { ViewChannel: true, SendMessages: false });
    } catch(e) { console.error(`No se pudo añadir al capitán ${teamData.capitanId} a los canales privados:`, e); }
    const guild = await client.guilds.fetch(tournament.guildId);
    const updatedTournament = await db.collection('tournaments').findOne({_id: tournament._id});
    await updatePublicMessages(client, updatedTournament);
    await updateTournamentManagementThread(client, updatedTournament);
    const teamCount = Object.keys(updatedTournament.teams.aprobados).length;
    if (teamCount === updatedTournament.config.format.size) {
        await updateTournamentChannelName(client);
    } else {
        await updateTournamentChannelName(client);
    }
}

export async function kickTeam(client, tournament, captainId) {
    const db = getDb();
    await db.collection('tournaments').updateOne( { _id: tournament._id }, { $unset: { [`teams.aprobados.${captainId}`]: "" } } );
    try {
        const chatChannel = await client.channels.fetch(tournament.discordChannelIds.chatChannelId);
        await chatChannel.permissionOverwrites.delete(captainId, 'Equipo expulsado del torneo');
        const matchesChannel = await client.channels.fetch(tournament.discordChannelIds.matchesChannelId);
        await matchesChannel.permissionOverwrites.delete(captainId, 'Equipo expulsado del torneo');
    } catch (e) { console.error(`No se pudieron revocar los permisos para el capitán ${captainId}:`, e); }
    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    await updatePublicMessages(client, updatedTournament);
    await updateTournamentManagementThread(client, updatedTournament);
    await updateTournamentChannelName(client);
}

export async function endTournament(client, tournament) {
    await setBotBusy(true);
    try {
        const db = getDb();
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });
        const finalTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
        await updateTournamentManagementThread(client, finalTournamentState);
        await cleanupTournament(client, finalTournamentState);
    } catch (error) { console.error(`Error crítico al finalizar torneo ${tournament.shortId}:`, error);
    } finally { await setBotBusy(false); await updateTournamentChannelName(client); }
}

async function cleanupTournament(client, tournament) {
    const { discordChannelIds, discordMessageIds } = tournament;
    const deleteResourceSafe = async (resourceId) => {
        if (!resourceId) return;
        try { const resource = await client.channels.fetch(resourceId).catch(() => null); if(resource) await resource.delete(); } 
        catch (err) { if (err.code !== 10003) console.error(`Fallo al borrar recurso ${resourceId}: ${err.message}`); }
    };
    for (const channelId of Object.values(discordChannelIds)) { await deleteResourceSafe(channelId); }
    for (const threadId of [discordMessageIds.managementThreadId, discordMessageIds.notificationsThreadId]) { await deleteResourceSafe(threadId); }
    try { const globalChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS); await globalChannel.messages.delete(discordMessageIds.statusMessageId);
    } catch(e) { if (e.code !== 10008) console.error("Fallo al borrar mensaje de estado global"); }
}

export async function forceResetAllTournaments(client) {
    await setBotBusy(true);
    try {
        const db = getDb();
        const allTournaments = await db.collection('tournaments').find({}).toArray();
        for (const tournament of allTournaments) {
            await cleanupTournament(client, tournament);
        }
        await db.collection('tournaments').deleteMany({});
    } catch (error) {
        console.error("Error crítico durante el reseteo forzoso:", error);
    } finally {
        await setBotBusy(false);
        await updateTournamentChannelName(client);
    }
}

export async function updatePublicMessages(client, tournament) {
    const db = getDb();
    const latestTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!latestTournamentState || !latestTournamentState.discordChannelIds) return;
    const editMessageSafe = async (channelId, messageId, content) => {
        if (!channelId || !messageId) return;
        try { const channel = await client.channels.fetch(channelId); const message = await channel.messages.fetch(messageId); await message.edit(content);
        } catch (e) { if (e.code !== 10008 && e.code !== 10003) console.warn(`Falla al actualizar mensaje ${messageId}: ${e.message}`); }
    };
    const { discordChannelIds, discordMessageIds } = latestTournamentState;
    await editMessageSafe(CHANNELS.TORNEOS_STATUS, discordMessageIds.statusMessageId, createTournamentStatusEmbed(latestTournamentState));
    await editMessageSafe(discordChannelIds.infoChannelId, discordMessageIds.classificationMessageId, createClassificationEmbed(latestTournamentState));
    await editMessageSafe(discordChannelIds.infoChannelId, discordMessageIds.calendarMessageId, createCalendarEmbed(latestTournamentState));
}

export async function startGroupStage(client, guild, tournament) {
    await setBotBusy(true);
    try {
        const db = getDb();
        const currentTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
        if (currentTournament.status !== 'inscripcion_abierta') { return; }
        currentTournament.status = 'fase_de_grupos';
        const format = currentTournament.config.format;
        let teams = Object.values(currentTournament.teams.aprobados);
        for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[teams[i], teams[j]] = [teams[j], teams[i]]; }
        const grupos = {}; const numGrupos = format.groups; const tamanoGrupo = format.size / numGrupos;
        for (let i = 0; i < teams.length; i++) {
            const grupoIndex = Math.floor(i / tamanoGrupo); const nombreGrupo = `Grupo ${String.fromCharCode(65 + grupoIndex)}`;
            if (!grupos[nombreGrupo]) grupos[nombreGrupo] = { equipos: [] };
            teams[i].stats = { pj: 0, pts: 0, gf: 0, gc: 0, dg: 0 };
            grupos[nombreGrupo].equipos.push(teams[i]);
        }
        currentTournament.structure.grupos = grupos;
        const calendario = {};
        for (const nombreGrupo in grupos) {
            const equiposGrupo = grupos[nombreGrupo].equipos; calendario[nombreGrupo] = [];
            if (equiposGrupo.length === 4) {
                const [t1, t2, t3, t4] = equiposGrupo;
                calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 1, t1, t2), createMatchObject(nombreGrupo, 1, t3, t4));
                calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 2, t1, t3), createMatchObject(nombreGrupo, 2, t2, t4));
                calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 3, t1, t4), createMatchObject(nombreGrupo, 3, t2, t3));
            }
        }
        currentTournament.structure.calendario = calendario;
        for (const nombreGrupo in calendario) {
            for (const partido of calendario[nombreGrupo].filter(p => p.jornada === 1)) {
                const threadId = await createMatchThread(client, guild, partido, currentTournament.discordChannelIds.matchesChannelId, currentTournament.shortId);
                partido.threadId = threadId; partido.status = 'en_curso';
            }
        }
        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: currentTournament });
        const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });
        await updatePublicMessages(client, finalTournamentState); 
        await updateTournamentManagementThread(client, finalTournamentState);
        await updateTournamentChannelName(client);
    } catch (error) { console.error(`Error durante el sorteo del torneo ${tournament.shortId}:`, error);
    } finally { await setBotBusy(false); }
}

// CORRECCIÓN: Se elimina la notificación automática.
export async function updateTournamentConfig(client, tournamentShortId, newConfig) {
    const db = getDb();
    const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!tournament) throw new Error('Torneo no encontrado');
    
    const updatedConfig = { ...tournament.config, ...newConfig };
    if (newConfig.formatId) { 
        updatedConfig.format = TOURNAMENT_FORMATS[newConfig.formatId]; 
    }
    
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { config: updatedConfig } });
    
    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    await updatePublicMessages(client, updatedTournament); 
    await updateTournamentManagementThread(client, updatedTournament);
}

// NUEVO: Función para la notificación manual.
export async function notifyCaptainsOfChanges(client, tournament) {
    const approvedCaptains = Object.values(tournament.teams.aprobados);
    if (approvedCaptains.length === 0) {
        return { success: true, message: "✅ No hay capitanes inscritos a los que notificar." };
    }

    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`📢 Actualización del Torneo / Tournament Update: ${tournament.nombre}`)
        .setDescription('🇪🇸 La configuración del torneo en el que te inscribiste ha cambiado. Revisa los nuevos detalles a continuación.\n🇬🇧 The configuration of the tournament you registered for has changed. Please review the new details below.')
        .addFields(
            { name: 'Formato / Format', value: tournament.config.format.label, inline: true },
            { name: 'Tipo / Type', value: tournament.config.isPaid ? 'De Pago / Paid' : 'Gratuito / Free', inline: true },
            { name: 'Entry', value: `${tournament.config.entryFee}€`, inline: true },
            { name: 'Premio Campeón / Champion Prize', value: `${tournament.config.prizeCampeon}€`, inline: true },
            { name: 'Premio Finalista / Runner-up Prize', value: `${tournament.config.prizeFinalista}€`, inline: true },
            { name: 'Inicio Programado / Scheduled Start', value: tournament.config.startTime || 'No especificado / Not specified', inline: true }
        )
        .setFooter({ text: 'Si tienes dudas, contacta a un administrador.' });

    let notifiedCount = 0;
    for (const team of approvedCaptains) {
        try {
            const user = await client.users.fetch(team.capitanId);
            await user.send({ embeds: [embed] });
            notifiedCount++;
        } catch (e) {
            console.warn(`No se pudo notificar al capitán ${team.capitanTag} sobre la actualización del torneo.`);
        }
    }
    return { success: true, message: `✅ Se ha enviado la notificación a ${notifiedCount} de ${approvedCaptains.length} capitanes.` };
}
