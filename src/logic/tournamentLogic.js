// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, ARBITRO_ROLE_ID, TOURNAMENT_CATEGORY_ID, TOURNAMENT_STATUS_ICONS } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createTeamListEmbed, createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed, createTournamentManagementPanel } from '../utils/embeds.js';
import { updateTournamentChannelName, updateAdminPanel, updateTournamentManagementThread } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType } from 'discord.js';

export async function createNewTournament(client, guild, name, shortId, config) {
    await setBotBusy(true);
    
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
                publicInfoThreadId: null,
                classificationMessageId: null,
                calendarMessageId: null,
                matchThreadsParentId: null,
                managementThreadId: null,
                notificationsThreadId: null,
            }
        };

        const matchThreadsParent = await guild.channels.create({ name: `⚽-${shortId}-partidos`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID });
        newTournament.discordMessageIds.matchThreadsParentId = matchThreadsParent.id;
        
        const statusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        const statusMsg = await statusChannel.send(createTournamentStatusEmbed(newTournament));
        newTournament.discordMessageIds.statusMessageId = statusMsg.id;

        const statusIcon = TOURNAMENT_STATUS_ICONS[newTournament.status] || '❓';
        const publicInfoThread = await statusMsg.startThread({
            name: `${statusIcon} ${name} - Info`,
            autoArchiveDuration: 10080,
        });
        newTournament.discordMessageIds.publicInfoThreadId = publicInfoThread.id;
        
        const classificationMsg = await publicInfoThread.send(createClassificationEmbed(newTournament));
        const calendarMsg = await publicInfoThread.send(createCalendarEmbed(newTournament));
        newTournament.discordMessageIds.classificationMessageId = classificationMsg.id;
        newTournament.discordMessageIds.calendarMessageId = calendarMsg.id;
    
        const equiposChannel = await client.channels.fetch(CHANNELS.CAPITANES_INSCRITOS);
        await equiposChannel.send({ content: `✅ Torneo **${name}** creado. La lista de equipos se puede consultar con el botón "Ver Detalles" en <#${CHANNELS.TORNEOS_STATUS}>.`});

        const managementParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT);
        const managementThread = await managementParentChannel.threads.create({
            name: `Gestión - ${name.slice(0, 50)}`,
            autoArchiveDuration: 10080,
            type: ChannelType.PrivateThread,
            reason: `Hilo de gestión para el torneo ${name}`
        });
        newTournament.discordMessageIds.managementThreadId = managementThread.id;
        
        const notificationsParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_APPROVALS_PARENT);
        const notificationsThread = await notificationsParentChannel.threads.create({
            name: `Avisos - ${name.slice(0, 50)}`,
            autoArchiveDuration: 10080,
            type: ChannelType.PrivateThread,
            reason: `Hilo de notificaciones para el torneo ${name}`
        });
        newTournament.discordMessageIds.notificationsThreadId = notificationsThread.id;
        
        await db.collection('tournaments').insertOne(newTournament);

        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);
        if (arbitroRole) {
            for (const member of arbitroRole.members.values()) {
                await managementThread.members.add(member.id).catch(() => {});
                await notificationsThread.members.add(member.id).catch(() => {});
            }
        }
        await managementThread.send(createTournamentManagementPanel(newTournament, true));

        console.log(`[INFO] Nuevo torneo "${name}" creado y anunciado COMPLETAMENTE.`);

    } catch (error) {
        console.error('[CREATE] OCURRIÓ UN ERROR EN MEDIO DEL PROCESO DE CREACIÓN:', error);
        throw error; 
    } finally {
        console.log('[CREATE] Proceso finalizado. Reseteando estado del bot a "listo".');
        await setBotBusy(false);
        await updateTournamentChannelName(client);
    }
}

export async function updateTournamentConfig(client, tournamentShortId, newConfig) {
    const db = getDb();
    const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!tournament) throw new Error('Torneo no encontrado');

    const originalConfig = JSON.parse(JSON.stringify(tournament.config));
    const updatedConfig = { ...tournament.config, ...newConfig };
    
    if (newConfig.formatId && newConfig.formatId !== originalConfig.formatId) {
        updatedConfig.format = TOURNAMENT_FORMATS[newConfig.formatId];
    }
    if (newConfig.entryFee !== undefined) {
        updatedConfig.isPaid = newConfig.entryFee > 0;
    }

    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { config: updatedConfig } });
    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    
    await updatePublicMessages(client, updatedTournament);
    await updateTournamentManagementThread(client, updatedTournament);

    const hasFormatChanged = newConfig.formatId && newConfig.formatId !== originalConfig.formatId;
    const hasFeeChanged = newConfig.entryFee !== undefined && newConfig.entryFee !== originalConfig.entryFee;

    if ((hasFormatChanged || hasFeeChanged) && Object.keys(tournament.teams.aprobados).length > 0) {
        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle(`⚠️ Actualización del Torneo / Tournament Update: ${tournament.nombre}`)
            .setDescription('🇪🇸 La configuración del torneo en el que te inscribiste ha cambiado. Revisa los nuevos detalles.\n🇬🇧 The configuration of the tournament you registered for has changed. Please review the new details.')
            .addFields(
                { name: 'Nuevo Formato / New Format', value: updatedTournament.config.format.label, inline: true },
                { name: 'Nueva Cuota / New Fee', value: updatedTournament.config.isPaid ? `${updatedTournament.config.entryFee}€` : 'Gratis / Free', inline: true },
                { name: 'Premio Campeón / Champion Prize', value: `${updatedTournament.config.prizeCampeon}€`, inline: true }
            )
            .setFooter({ text: 'Si tienes dudas, contacta a un administrador.' });

        for (const team of Object.values(tournament.teams.aprobados)) {
            try {
                const user = await client.users.fetch(team.capitanId);
                await user.send({ embeds: [embed] });
            } catch (e) {
                console.warn(`No se pudo notificar al capitán ${team.capitanTag} sobre la actualización del torneo.`);
            }
        }
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

        await updatePublicMessages(client, finalTournamentState);
        await updateTournamentManagementThread(client, finalTournamentState);
        await updateTournamentChannelName(client);
        
        try {
            const managementThread = await client.channels.fetch(finalTournamentState.discordMessageIds.managementThreadId);
            await managementThread.send('✅ **Torneo finalizado por completo.**\nEste hilo de gestión ya puede ser archivado o borrado manualmente.');
        } catch (e) {
            if (e.code !== 10003) console.warn(`No se pudo enviar el mensaje final al hilo de gestión para ${tournament.shortId}`);
        }
        
        try {
            const notificationsThread = await client.channels.fetch(finalTournamentState.discordMessageIds.notificationsThreadId);
            await notificationsThread.send('✅ **Torneo finalizado por completo.**\nEste hilo de notificaciones ya puede ser archivado o borrado manualmente.');
        } catch (e) {
            if (e.code !== 10003) console.warn(`No se pudo enviar el mensaje final al hilo de notificaciones para ${tournament.shortId}`);
        }

        await cleanupTournament(client, finalTournamentState);
        console.log(`[LOGIC] Proceso de finalización completado para: ${tournament.shortId}`);

    } catch (error) {
        console.error(`Error crítico durante la finalización del torneo ${tournament.shortId}:`, error);
    } finally {
        await setBotBusy(false);
    }
}

async function cleanupTournament(client, tournament) {
    console.log(`[CLEANUP] Iniciando limpieza de recursos para: ${tournament.shortId}`);
    const { discordMessageIds } = tournament;
    
    await (client.channels.fetch(CHANNELS.TORNEOS_STATUS).catch(()=>null))?.messages.delete(discordMessageIds.statusMessageId).catch(()=>{});
    await (client.channels.fetch(discordMessageIds.matchThreadsParentId).catch(()=>null))?.delete('Torneo finalizado.').catch(()=>{});

    console.log(`[CLEANUP] Limpieza de recursos completada.`);
}

export async function updatePublicMessages(client, tournament) {
    const db = getDb();
    const latestTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!latestTournamentState) return;

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

    await editMessageSafe(CHANNELS.TORNEOS_STATUS, latestTournamentState.discordMessageIds.statusMessageId, createTournamentStatusEmbed(latestTournamentState));
    
    if (latestTournamentState.discordMessageIds.publicInfoThreadId) {
        await editMessageSafe(latestTournamentState.discordMessageIds.publicInfoThreadId, latestTournamentState.discordMessageIds.classificationMessageId, createClassificationEmbed(latestTournamentState));
        await editMessageSafe(latestTournamentState.discordMessageIds.publicInfoThreadId, latestTournamentState.discordMessageIds.calendarMessageId, createCalendarEmbed(latestTournamentState));
    }
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
                const threadId = await createMatchThread(client, guild, partido, currentTournament);
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
