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
        if (!arbitroRole) {
            console.error("ERROR CRÍTICO: El rol de Árbitro no se encuentra. No se pueden establecer los permisos correctamente.");
            throw new Error("El rol de Árbitro no fue encontrado.");
        }

        const tournamentCategory = await guild.channels.create({
            name: `🏆 ${name}`,
            type: ChannelType.GuildCategory,
        });

        const publicReadOnlyPermissions = [
            { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.CreatePublicThreads, PermissionsBitField.Flags.CreatePrivateThreads] }
        ];

        const participantsAndStaffPermissions = [
             { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
             { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        const inscriptionsChannel = await guild.channels.create({ name: `✅-inscripciones-registrations`, type: ChannelType.GuildText, parent: tournamentCategory.id });
        const teamsChannel = await guild.channels.create({ name: `👥-equipos-teams`, type: ChannelType.GuildText, parent: tournamentCategory.id, permissionOverwrites: publicReadOnlyPermissions });
        const classificationChannel = await guild.channels.create({ name: `📊-clasificacion-ranking`, type: ChannelType.GuildText, parent: tournamentCategory.id, permissionOverwrites: publicReadOnlyPermissions });
        const calendarChannel = await guild.channels.create({ name: `🗓️-calendario-schedule`, type: ChannelType.GuildText, parent: tournamentCategory.id, permissionOverwrites: publicReadOnlyPermissions });
        const matchesChannel = await guild.channels.create({ name: `⚽-partidos-matches`, type: ChannelType.GuildText, parent: tournamentCategory.id, permissionOverwrites: participantsAndStaffPermissions });
        const chatChannel = await guild.channels.create({ name: `💬-chat-capitanes`, type: ChannelType.GuildText, parent: tournamentCategory.id, permissionOverwrites: participantsAndStaffPermissions });

        const newTournament = {
            _id: new ObjectId(),
            shortId: shortId,
            guildId: guild.id,
            nombre: name,
            status: 'inscripcion_abierta',
            config: { formatId: config.formatId, format: format, isPaid: config.isPaid, entryFee: config.entryFee || 0, prizeCampeon: config.prizeCampeon || 0, prizeFinalista: config.prizeFinalista || 0, enlacePaypal: config.enlacePaypal || null },
            teams: { pendientes: {}, aprobados: {} },
            structure: { grupos: {}, calendario: {}, eliminatorias: { rondaActual: null } },
            discordChannelIds: {
                categoryId: tournamentCategory.id,
                inscriptionsChannelId: inscriptionsChannel.id,
                teamsChannelId: teamsChannel.id,
                classificationChannelId: classificationChannel.id,
                calendarChannelId: calendarChannel.id,
                matchesChannelId: matchesChannel.id,
                chatChannelId: chatChannel.id,
            },
            discordMessageIds: {
                statusMessageId: null, teamListMessageId: null, classificationMessageId: null,
                calendarMessageId: null, managementThreadId: null, notificationsThreadId: null,
            }
        };
        
        const statusMsg = await inscriptionsChannel.send(createTournamentStatusEmbed(newTournament));
        const teamListMsg = await teamsChannel.send(createTeamListEmbed(newTournament));
        const classificationMsg = await classificationChannel.send(createClassificationEmbed(newTournament));
        const calendarMsg = await calendarChannel.send(createCalendarEmbed(newTournament));

        newTournament.discordMessageIds.statusMessageId = statusMsg.id;
        newTournament.discordMessageIds.teamListMessageId = teamListMsg.id;
        newTournament.discordMessageIds.classificationMessageId = classificationMsg.id;
        newTournament.discordMessageIds.calendarMessageId = calendarMsg.id;

        const managementParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT);
        const managementThread = await managementParentChannel.threads.create({ name: `Gestión - ${name.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
        newTournament.discordMessageIds.managementThreadId = managementThread.id;
        
        const notificationsParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_APPROVALS_PARENT);
        const notificationsThread = await notificationsParentChannel.threads.create({ name: `Avisos - ${name.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
        newTournament.discordMessageIds.notificationsThreadId = notificationsThread.id;

        await db.collection('tournaments').insertOne(newTournament);
        
        const globalStatusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        const announcementEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle(`🟢 Nuevo Torneo Abierto: ${name}`)
            .setDescription(`¡Las inscripciones ya están abiertas! Haz clic en el botón de abajo para ir al canal de inscripciones y ver todos los detalles.`)
            .setTimestamp();
        const announcementButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Ir a Inscripciones').setStyle(ButtonStyle.Link).setURL(inscriptionsChannel.url).setEmoji('✅')
        );
        await globalStatusChannel.send({ embeds: [announcementEmbed], components: [announcementButton] });
        
        if (arbitroRole) {
            for (const member of arbitroRole.members.values()) {
                await managementThread.members.add(member.id).catch(() => {});
                await notificationsThread.members.add(member.id).catch(() => {});
            }
        }
        await managementThread.send(createTournamentManagementPanel(newTournament, true));

        console.log(`[INFO] Nuevo torneo "${name}" creado con su propia categoría y canales.`);

    } catch (error) {
        console.error('[CREATE] OCURRIÓ UN ERROR EN MEDIO DEL PROCESO DE CREACIÓN:', error);
        await setBotBusy(false);
        throw error; 
    } finally {
        await setBotBusy(false);
        await updateTournamentChannelName(client);
    }
}

export async function approveTeam(client, tournament, teamData) {
    const db = getDb();
    let latestTournament = await db.collection('tournaments').findOne({_id: tournament._id});
    
    if (!latestTournament.teams.aprobados) latestTournament.teams.aprobados = {};
    latestTournament.teams.aprobados[teamData.capitanId] = teamData;
    if (latestTournament.teams.pendientes[teamData.capitanId]) delete latestTournament.teams.pendientes[teamData.capitanId];

    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: {
        'teams.aprobados': latestTournament.teams.aprobados,
        'teams.pendientes': latestTournament.teams.pendientes
    }});
    
    try {
        const chatChannel = await client.channels.fetch(latestTournament.discordChannelIds.chatChannelId);
        await chatChannel.permissionOverwrites.edit(teamData.capitanId, {
            ViewChannel: true,
            SendMessages: true,
        });
        await chatChannel.send(`👋 ¡Bienvenido, <@${teamData.capitanId}>! (${teamData.nombre})`);

        const matchesChannel = await client.channels.fetch(latestTournament.discordChannelIds.matchesChannelId);
        await matchesChannel.permissionOverwrites.edit(teamData.capitanId, {
            ViewChannel: true,
            SendMessages: false, // Solo puede ver el canal, escribirá en los hilos.
        });

    } catch(e) {
        console.error(`No se pudo añadir al capitán ${teamData.capitanId} a los canales privados:`, e);
    }

    const guild = await client.guilds.fetch(tournament.guildId);
    const updatedTournament = await db.collection('tournaments').findOne({_id: tournament._id});

    await updatePublicMessages(client, updatedTournament);
    await updateTournamentManagementThread(client, updatedTournament);
    
    const teamCount = Object.keys(updatedTournament.teams.aprobados).length;
    if (teamCount === updatedTournament.config.format.size) {
        console.log(`[INFO] ¡Cupo lleno para ${updatedTournament.nombre}! Iniciando sorteo.`);
        await startGroupStage(client, guild, updatedTournament);
    }
}

export async function endTournament(client, tournament) {
    console.log(`[LOGIC] Iniciando finalización para: ${tournament.shortId}`);
    await setBotBusy(true);

    try {
        const db = getDb();
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });
        const finalTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });

        await updateTournamentManagementThread(client, finalTournamentState);
        await updateTournamentChannelName(client);
        
        await cleanupTournament(client, finalTournamentState);
        console.log(`[LOGIC] Proceso de finalización y limpieza completado para: ${tournament.shortId}`);

    } catch (error) {
        console.error(`Error crítico durante la finalización del torneo ${tournament.shortId}:`, error);
    } finally {
        await setBotBusy(false);
        await updateTournamentChannelName(client);
    }
}

async function cleanupTournament(client, tournament) {
    console.log(`[CLEANUP] Iniciando limpieza de la categoría para: ${tournament.shortId}`);
    
    if (!tournament.discordChannelIds || !tournament.discordChannelIds.categoryId) {
        console.warn(`[CLEANUP] No se encontró el ID de la categoría para el torneo ${tournament.shortId}. No se puede limpiar.`);
        return;
    }

    const categoryId = tournament.discordChannelIds.categoryId;
    
    try {
        const category = await client.channels.fetch(categoryId);
        for (const channel of category.children.cache.values()) {
            await channel.delete(`Torneo ${tournament.shortId} finalizado.`);
        }
        await category.delete(`Torneo ${tournament.shortId} finalizado.`);
        console.log(`[CLEANUP] ÉXITO al borrar la categoría del torneo (${categoryId}).`);
    } catch (err) {
        if (err.code !== 10003) {
            console.error(`[CLEANUP] FALLO al borrar la categoría del torneo (${categoryId}). Error: ${err.message}`);
        }
    }

    try {
        const managementThread = await client.channels.fetch(tournament.discordMessageIds.managementThreadId);
        await managementThread.delete();
    } catch(e) { if(e.code !== 10003) console.error("Error borrando hilo de gestión"); }
    
    try {
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId);
        await notificationsThread.delete();
    } catch(e) { if(e.code !== 10003) console.error("Error borrando hilo de notificaciones"); }

    console.log(`[CLEANUP] Limpieza de recursos completada.`);
}

export async function updatePublicMessages(client, tournament) {
    const db = getDb();
    const latestTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!latestTournamentState || !latestTournamentState.discordChannelIds) return;

    const editMessageSafe = async (channelId, messageId, content) => {
        if (!channelId || !messageId) return;
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            await message.edit(content);
        } catch (e) {
            if (e.code !== 10008 && e.code !== 10003) console.warn(`[WARN] Falla al actualizar mensaje ${messageId}: ${e.message}`);
        }
    };
    
    const { discordChannelIds, discordMessageIds } = latestTournamentState;

    await editMessageSafe(discordChannelIds.inscriptionsChannelId, discordMessageIds.statusMessageId, createTournamentStatusEmbed(latestTournamentState));
    await editMessageSafe(discordChannelIds.teamsChannelId, discordMessageIds.teamListMessageId, createTeamListEmbed(latestTournamentState));
    await editMessageSafe(discordChannelIds.classificationChannelId, discordMessageIds.classificationMessageId, createClassificationEmbed(latestTournamentState));
    await editMessageSafe(discordChannelIds.calendarChannelId, discordMessageIds.calendarMessageId, createCalendarEmbed(latestTournamentState));
}

export async function startGroupStage(client, guild, tournament) {
    await setBotBusy(true);
    try {
        const db = getDb();
        const currentTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
        if (currentTournament.status !== 'inscripcion_abierta') {
            await setBotBusy(false);
            return;
        }

        currentTournament.status = 'fase_de_grupos';
        const format = currentTournament.config.format;
        let teams = Object.values(currentTournament.teams.aprobados);
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
        currentTournament.structure.grupos = grupos;

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
        currentTournament.structure.calendario = calendario;

        for (const nombreGrupo in calendario) {
            for (const partido of calendario[nombreGrupo].filter(p => p.jornada === 1)) {
                const threadId = await createMatchThread(client, guild, partido, currentTournament.discordChannelIds.matchesChannelId, currentTournament.shortId);
                partido.threadId = threadId;
                partido.status = 'en_curso';
            }
        }

        await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: currentTournament });
        
        const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });

        await updatePublicMessages(client, finalTournamentState);
        await updateTournamentChannelName(client);
        
        console.log(`[INFO] Sorteo realizado para el torneo: ${finalTournamentState.nombre}`);

    } catch (error) {
        console.error(`Error durante el sorteo del torneo ${tournament.shortId}:`, error);
    } finally {
        await setBotBusy(false);
    }
}
