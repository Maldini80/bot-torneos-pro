// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, ARBITRO_ROLE_ID, TOURNAMENT_CATEGORY_ID, CASTER_ROLE_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed, createTournamentManagementPanel, createTeamListEmbed, createCasterInfoEmbed, createDraftStatusEmbed, createDraftManagementPanel, createDraftMainInterface, createDraftPickEmbed } from '../utils/embeds.js';
import { updateAdminPanel, updateTournamentManagementThread, updateDraftManagementPanel } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { postTournamentUpdate } from '../utils/twitter.js';

export async function approveDraftCaptain(client, draft, captainData) {
    const db = getDb();

    const captainAsPlayer = {
        userId: captainData.userId,
        userName: captainData.userName,
        psnId: captainData.psnId,
        twitter: captainData.twitter,
        primaryPosition: captainData.position,
        secondaryPosition: captainData.position,
        currentTeam: captainData.teamName,
        isCaptain: true,
        captainId: null
    };

    await db.collection('drafts').updateOne(
        { _id: draft._id },
        {
            $push: {
                captains: captainData,
                players: captainAsPlayer
            },
            $unset: { [`pendingCaptains.${captainData.userId}`]: "" }
        }
    );

    try {
        const user = await client.users.fetch(captainData.userId);
        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle(`✅ Aprobado para el Draft: ${draft.name}`)
            .setDescription(
                `¡Enhorabuena! Tu solicitud para ser capitán del equipo **${captainData.teamName}** ha sido **aprobada**.\n\n` +
                `Ya apareces en la lista oficial de capitanes y jugadores.`
            );
        await user.send({ embeds: [embed] });
    } catch (e) { console.warn(`No se pudo enviar MD de aprobación de draft al capitán ${captainData.userId}:`, e.message); }
    
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
}

export async function kickPlayerFromDraft(client, draft, userIdToKick) {
    const db = getDb();
    const isCaptain = draft.captains.some(c => c.userId === userIdToKick);

    let updateQuery;
    if (isCaptain) {
        updateQuery = { $pull: { captains: { userId: userIdToKick }, players: { userId: userIdToKick } } };
    } else {
        updateQuery = { $pull: { players: { userId: userIdToKick }, reserves: { userId: userIdToKick } } };
    }

    await db.collection('drafts').updateOne({ _id: draft._id }, updateQuery);

    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
}

export async function approveUnregisterFromDraft(client, draft, userIdToUnregister) {
    await kickPlayerFromDraft(client, draft, userIdToUnregister);
    try {
        const user = await client.users.fetch(userIdToUnregister);
        await user.send(`✅ Tu solicitud de baja del draft **${draft.name}** ha sido **aprobada**.`);
    } catch (e) {
        console.warn('No se pudo notificar al usuario de la baja de draft aprobada');
    }
}

export async function requestUnregisterFromDraft(client, draft, userId) {
    const isPlayer = draft.players.some(p => p.userId === userId);
    if (!isPlayer) {
        return { success: false, message: "No estás inscrito en este draft." };
    }

    const isCaptain = draft.captains.some(c => c.userId === userId);
    if (isCaptain) {
        return { success: false, message: "Los capitanes no pueden solicitar la baja. Debe ser gestionado por un administrador." };
    }

    const notificationsThread = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId).catch(() => null);
    if (!notificationsThread) {
        return { success: false, message: "Error interno del bot." };
    }

    const player = draft.players.find(p => p.userId === userId);

    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('👋 Solicitud de Baja de Draft')
        .setDescription(`El jugador **${player.userName}** (${player.psnId}) solicita darse de baja del draft **${draft.name}**.`)
        .setFooter({ text: `ID del Jugador: ${userId}`});

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_unregister_draft_approve:${draft.shortId}:${userId}`).setLabel('Aprobar Baja').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`admin_unregister_draft_reject:${draft.shortId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
    );

    await notificationsThread.send({ embeds: [embed], components: [row] });

    return { success: true, message: "✅ Tu solicitud de baja ha sido enviada a los administradores." };
}

export async function endDraft(client, draft) {
    await setBotBusy(true);
    try {
        const db = getDb();
        await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { status: 'finalizado' } });
        await cleanupDraft(client, draft);

    } catch (error) {
        console.error(`Error crítico al finalizar el draft ${draft.shortId}:`, error);
    } finally {
        await setBotBusy(false);
    }
}

async function cleanupDraft(client, draft) {
    const { discordChannelId, discordMessageIds } = draft;

    const deleteResourceSafe = async (fetcher, resourceId) => {
        if (!resourceId) return;
        try {
            const resource = await fetcher(resourceId).catch(() => null);
            if (resource) await resource.delete();
        } catch (err) {
            if (err.code !== 10003 && err.code !== 10008) {
                console.error(`Fallo al borrar recurso ${resourceId}: ${err.message}`);
            }
        }
    };

    await deleteResourceSafe(client.channels.fetch.bind(client.channels), discordChannelId);
    await deleteResourceSafe(client.channels.fetch.bind(client.channels), discordMessageIds.managementThreadId);
    await deleteResourceSafe(client.channels.fetch.bind(client.channels), discordMessageIds.notificationsThreadId);

    try {
        const globalChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        await deleteResourceSafe(globalChannel.messages.fetch.bind(globalChannel.messages), discordMessageIds.statusMessageId);
    } catch(e) {
        console.warn("No se pudo encontrar o borrar el mensaje de estado del draft.");
    }
}

export async function simulateDraftPicks(client, draftShortId) {
    await setBotBusy(true);
    const db = getDb();
    try {
        let draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) throw new Error('Draft no encontrado.');
        if (draft.status !== 'seleccion') throw new Error('La simulación solo puede iniciarse durante la fase de selección.');

        let availablePlayers = draft.players.filter(p => !p.captainId);
        const captains = draft.captains;

        const shuffleArray = (array) => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
        };

        shuffleArray(availablePlayers);

        const playersPerTeam = 11;
        const bulkOps = [];

        for (const captain of captains) {
            const currentTeamSize = draft.players.filter(p => p.captainId === captain.userId).length;
            const playersNeeded = playersPerTeam - currentTeamSize;

            for (let i = 0; i < playersNeeded; i++) {
                const playerToAssign = availablePlayers.pop();
                if (!playerToAssign) break; 
                bulkOps.push({
                    updateOne: {
                        filter: { _id: draft._id, "players.userId": playerToAssign.userId },
                        update: { $set: { "players.$.captainId": captain.userId } }
                    }
                });
            }
        }

        if (bulkOps.length > 0) {
            await db.collection('drafts').bulkWrite(bulkOps);
        }

        await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $set: { status: 'finalizado' } }
        );

        const finalDraftState = await db.collection('drafts').findOne({ _id: draft._id });
        await updateDraftMainInterface(client, finalDraftState.shortId);
        await updateDraftManagementPanel(client, finalDraftState);
        await updatePublicMessages(client, finalDraftState);
        
        const draftChannel = await client.channels.fetch(finalDraftState.discordChannelId);
        if (draftChannel) {
             await draftChannel.send('**✅ LA SELECCIÓN HA SIDO COMPLETADA POR SIMULACIÓN DE UN ADMIN.**');
        }

    } catch (error) {
        console.error(`[DRAFT SIMULATE] Error durante la simulación de picks para ${draftShortId}:`, error);
        throw error;
    } finally {
        await setBotBusy(false);
    }
}

export async function createTournamentFromDraft(client, guild, draftShortId, formatId) {
    await setBotBusy(true);
    const db = getDb();

    try {
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft || draft.status !== 'finalizado') {
            throw new Error('Este draft no ha finalizado o no existe.');
        }

        const approvedTeams = {};
        for (const captain of draft.captains) {
            const teamData = {
                id: captain.userId,
                nombre: captain.teamName,
                eafcTeamName: captain.psnId,
                capitanId: captain.userId,
                capitanTag: captain.userName,
                coCaptainId: null,
                coCaptainTag: null,
                bandera: '🏳️',
                paypal: null,
                streamChannel: captain.streamChannel,
                twitter: captain.twitter,
                inscritoEn: new Date()
            };
            approvedTeams[captain.userId] = teamData;
        }

        const tournamentName = `Torneo Draft - ${draft.name}`;
        const tournamentShortId = `draft-${draft.shortId}`;
        const config = {
            formatId: formatId,
            isPaid: draft.config.isPaid,
            entryFee: draft.config.entryFee,
            prizeCampeon: draft.config.prizeCampeon,
            prizeFinalista: draft.config.prizeFinalista,
            startTime: null
        };
        
        const format = TOURNAMENT_FORMATS[config.formatId];
        if (!format) throw new Error(`Formato de torneo inválido: ${config.formatId}`);
        
        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID);
        const casterRole = await guild.roles.fetch(CASTER_ROLE_ID).catch(() => null);

        const participantsAndStaffPermissions = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ...Object.keys(approvedTeams).map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel] }))
        ];

        const infoChannel = await guild.channels.create({ name: `🏆-${tournamentShortId}-info`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] }] });
        const matchesChannel = await guild.channels.create({ name: `⚽-${tournamentShortId}-partidos`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });
        const chatChannel = await guild.channels.create({ name: `💬-${tournamentShortId}-chat`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });

        const newTournament = {
            _id: new ObjectId(), shortId: tournamentShortId, guildId: guild.id, nombre: tournamentName, status: 'inscripcion_abierta',
            config,
            teams: { pendientes: {}, aprobados: approvedTeams, reserva: {}, coCapitanes: {} },
            structure: { grupos: {}, calendario: {}, eliminatorias: { rondaActual: null } },
            discordChannelIds: { infoChannelId: infoChannel.id, matchesChannelId: matchesChannel.id, chatChannelId: chatChannel.id },
            discordMessageIds: {}
        };

        const globalStatusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        const statusMsg = await globalStatusChannel.send(createTournamentStatusEmbed(newTournament));
        const classificationMsg = await infoChannel.send(createClassificationEmbed(newTournament));
        const calendarMsg = await infoChannel.send(createCalendarEmbed(newTournament));
        newTournament.discordMessageIds.statusMessageId = statusMsg.id;
        newTournament.discordMessageIds.classificationMessageId = classificationMsg.id;
        newTournament.discordMessageIds.calendarMessageId = calendarMsg.id;
        
        const managementParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT);
        const managementThread = await managementParentChannel.threads.create({ name: `Gestión - ${tournamentName.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
        newTournament.discordMessageIds.managementThreadId = managementThread.id;
        
        const notificationsParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_APPROVALS_PARENT);
        const notificationsThread = await notificationsParentChannel.threads.create({ name: `Avisos - ${tournamentName.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
        newTournament.discordMessageIds.notificationsThreadId = notificationsThread.id;
        
        const casterParentChannel = await client.channels.fetch(CHANNELS.CASTER_HUB_ID);
        const casterThread = await casterParentChannel.threads.create({ name: `Casters - ${tournamentName.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
        newTournament.discordMessageIds.casterThreadId = casterThread.id;

        await db.collection('tournaments').insertOne(newTournament);
        
        for (const member of arbitroRole.members.values()) { await managementThread.members.add(member.id).catch(()=>{}); await notificationsThread.members.add(member.id).catch(()=>{}); }
        if (casterRole) { for (const member of casterRole.members.values()) { await casterThread.members.add(member.id).catch(()=>{}); } }
        
        await managementThread.send(createTournamentManagementPanel(newTournament, true));

        await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { status: 'torneo_generado' } });
        await cleanupDraft(client, draft);

        return newTournament;

    } catch (error) {
        console.error('[CREATE TOURNAMENT FROM DRAFT] Error:', error);
        throw error;
    } finally {
        await setBotBusy(false);
    }
}
export async function confirmPrizePayment(client, userId, prizeType, tournament) {
    try {
        const user = await client.users.fetch(userId);
        await user.send(`💰 ¡Buenas noticias! Tu premio de **${prizeType}** del torneo **${tournament.nombre}** ha sido marcado como **pagado**. ¡Gracias por participar!`);
        return { success: true };
    } catch (e) {
        console.warn(`No se pudo notificar al usuario ${userId} del pago del premio.`);
        return { success: false, error: e };
    }
}
export async function createNewTournament(client, guild, name, shortId, config) {
    await setBotBusy(true);
    try {
        const db = getDb();
        const format = TOURNAMENT_FORMATS[config.formatId];
        if (!format) throw new Error(`Formato de torneo inválido: ${config.formatId}`);
        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);
        if (!arbitroRole) throw new Error("El rol de Árbitro no fue encontrado.");
        
        const casterRole = await guild.roles.fetch(CASTER_ROLE_ID).catch(() => null);
        
        const participantsAndStaffPermissions = [ { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] } ];
        const infoChannel = await guild.channels.create({ name: `🏆-${shortId}-info`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] }] });
        const matchesChannel = await guild.channels.create({ name: `⚽-${shortId}-partidos`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });
        const chatChannel = await guild.channels.create({ name: `💬-${shortId}-chat`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });
        
        const newTournament = {
            _id: new ObjectId(), shortId, guildId: guild.id, nombre: name, status: 'inscripcion_abierta',
            config: { formatId: config.formatId, format, isPaid: config.isPaid, entryFee: config.entryFee || 0, prizeCampeon: config.prizeCampeon || 0, prizeFinalista: config.prizeFinalista || 0, enlacePaypal: config.enlacePaypal || null, startTime: config.startTime || null },
            teams: { pendientes: {}, aprobados: {}, reserva: {}, coCapitanes: {} },
            structure: { grupos: {}, calendario: {}, eliminatorias: { rondaActual: null } },
            discordChannelIds: { infoChannelId: infoChannel.id, matchesChannelId: matchesChannel.id, chatChannelId: chatChannel.id },
            discordMessageIds: { statusMessageId: null, classificationMessageId: null, calendarMessageId: null, managementThreadId: null, notificationsThreadId: null, casterThreadId: null }
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
        
        const casterParentChannel = await client.channels.fetch(CHANNELS.CASTER_HUB_ID);
        const casterThread = await casterParentChannel.threads.create({ name: `Casters - ${name.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
        newTournament.discordMessageIds.casterThreadId = casterThread.id;

        await db.collection('tournaments').insertOne(newTournament);

        if (arbitroRole) {
            for (const member of arbitroRole.members.values()) {
                await managementThread.members.add(member.id).catch(()=>{});
                await notificationsThread.members.add(member.id).catch(()=>{});
                await casterThread.members.add(member.id).catch(()=>{});
            }
        }
        if (casterRole) {
            for (const member of casterRole.members.values()) {
                 await casterThread.members.add(member.id).catch(()=>{});
            }
        }

        await managementThread.send(createTournamentManagementPanel(newTournament, true));

        postTournamentUpdate(newTournament).catch(console.error);

    } catch (error) {
        console.error('[CREATE] OCURRIÓ UN ERROR EN MEDIO DEL PROCESO DE CREACIÓN:', error);
        await setBotBusy(false); throw error;
    } finally {
        await setBotBusy(false);
    }
}
export async function approveTeam(client, tournament, teamData) {
    const db = getDb();
    let latestTournament = await db.collection('tournaments').findOne({_id: tournament._id});
    if (!latestTournament.teams.aprobados) latestTournament.teams.aprobados = {};
    latestTournament.teams.aprobados[teamData.capitanId] = teamData;
    if (latestTournament.teams.pendientes[teamData.capitanId]) delete latestTournament.teams.pendientes[teamData.capitanId];
    
    if (latestTournament.teams.reserva && latestTournament.teams.reserva[teamData.capitanId]) {
        delete latestTournament.teams.reserva[teamData.capitanId];
    }

    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { 'teams.aprobados': latestTournament.teams.aprobados, 'teams.pendientes': latestTournament.teams.pendientes, 'teams.reserva': latestTournament.teams.reserva }});
    
    try {
        const chatChannel = await client.channels.fetch(latestTournament.discordChannelIds.chatChannelId);
        const matchesChannel = await client.channels.fetch(latestTournament.discordChannelIds.matchesChannelId);

        await chatChannel.permissionOverwrites.edit(teamData.capitanId, { ViewChannel: true, SendMessages: true });
        await matchesChannel.permissionOverwrites.edit(teamData.capitanId, { ViewChannel: true, SendMessages: false });

        const inviteButtonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`invite_cocaptain_start:${latestTournament.shortId}`)
                .setLabel('Invitar Co-Capitán / Invite Co-Captain')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🤝')
        );

        await chatChannel.send({
            content: `👋 ¡Bienvenido, <@${teamData.capitanId}>! (${teamData.nombre}).\n*Puedes usar el botón de abajo para invitar a tu co-capitán.*`,
            components: [inviteButtonRow]
        });

        const user = await client.users.fetch(teamData.capitanId);
        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle(`✅ Aprobado para ${latestTournament.nombre}`)
            .setDescription(`🇪🇸 ¡Enhorabuena! Tu equipo **${teamData.nombre}** ha sido **aprobado**.\n\n` +
                          `Dirígete al canal <#${chatChannel.id}> para chatear con otros participantes e invitar a tu co-capitán.` +
                          `\n\n🇬🇧 Congratulations! Your team **${teamData.nombre}** has been **approved**.\n\n` +
                          `Head over to the <#${chatChannel.id}> channel to chat with other participants and invite your co-captain.`);
        
        await user.send({ embeds: [embed] });

    } catch(e) { 
        console.error(`Error en la aprobación o al dar permisos al capitán ${teamData.capitanId}:`, e); 
    }
    
    const updatedTournament = await db.collection('tournaments').findOne({_id: tournament._id});
    
    await notifyCastersOfNewTeam(client, updatedTournament, teamData);

    await updatePublicMessages(client, updatedTournament);
    await updateTournamentManagementThread(client, updatedTournament);
}
export async function addCoCaptain(client, tournament, captainId, coCaptainId) {
    const db = getDb();
    const coCaptainUser = await client.users.fetch(coCaptainId);
    
    await db.collection('tournaments').updateOne(
        { _id: tournament._id },
        { 
            $set: { 
                [`teams.aprobados.${captainId}.coCaptainId`]: coCaptainId,
                [`teams.aprobados.${captainId}.coCaptainTag`]: coCaptainUser.tag
            },
            $unset: {
                [`teams.coCapitanes.${captainId}`]: ""
            }
        }
    );

    try {
        const chatChannel = await client.channels.fetch(tournament.discordChannelIds.chatChannelId);
        await chatChannel.permissionOverwrites.edit(coCaptainId, { ViewChannel: true, SendMessages: true });
        const matchesChannel = await client.channels.fetch(tournament.discordChannelIds.matchesChannelId);
        await matchesChannel.permissionOverwrites.edit(coCaptainId, { ViewChannel: true, SendMessages: false });
    } catch (e) {
        console.error(`No se pudieron dar permisos al co-capitán ${coCaptainId}:`, e);
    }

    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    await updatePublicMessages(client, updatedTournament);
}
export async function kickTeam(client, tournament, captainId) {
    const db = getDb();
    const teamData = tournament.teams.aprobados[captainId];
    if (!teamData) return;

    try {
        const chatChannel = await client.channels.fetch(tournament.discordChannelIds.chatChannelId);
        await chatChannel.permissionOverwrites.delete(captainId, 'Equipo expulsado del torneo');
        const matchesChannel = await client.channels.fetch(tournament.discordChannelIds.matchesChannelId);
        await matchesChannel.permissionOverwrites.delete(captainId, 'Equipo expulsado del torneo');
    } catch (e) { console.error(`No se pudieron revocar los permisos para el capitán ${captainId}:`, e); }

    if (teamData.coCaptainId) {
        try {
            const chatChannel = await client.channels.fetch(tournament.discordChannelIds.chatChannelId);
            await chatChannel.permissionOverwrites.delete(teamData.coCaptainId, 'Equipo expulsado del torneo');
            const matchesChannel = await client.channels.fetch(tournament.discordChannelIds.matchesChannelId);
            await matchesChannel.permissionOverwrites.delete(teamData.coCaptainId, 'Equipo expulsado del torneo');
        } catch (e) { console.error(`No se pudieron revocar los permisos para el co-capitán ${teamData.coCaptainId}:`, e); }
    }
    
    await db.collection('tournaments').updateOne( { _id: tournament._id }, { $unset: { [`teams.aprobados.${captainId}`]: "" } } );
    
    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });

    try {
        const casterThread = await client.channels.fetch(updatedTournament.discordMessageIds.casterThreadId).catch(()=>null);
        if (casterThread) {
            await casterThread.send(`- Equipo **${teamData.nombre}** (Capitán: ${teamData.capitanTag}) ha sido eliminado del torneo.`);
        }
    } catch (e) {
        console.warn(`No se pudo notificar la expulsión en el hilo de casters para el torneo ${tournament.shortId}`);
    }

    await updatePublicMessages(client, updatedTournament);
    await updateTournamentManagementThread(client, updatedTournament);
}
export async function undoGroupStageDraw(client, tournamentShortId) {
    await setBotBusy(true);
    const db = getDb();
    
    try {
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || tournament.status !== 'fase_de_grupos') {
            throw new Error('El torneo no está en fase de grupos o no existe.');
        }

        const allMatches = Object.values(tournament.structure.calendario).flat();
        for (const match of allMatches) {
            if (match.threadId) {
                const thread = await client.channels.fetch(match.threadId).catch(() => null);
                if (thread) {
                    await thread.delete('Sorteo revertido por un administrador.').catch(e => console.warn(`No se pudo borrar el hilo ${thread.id}: ${e.message}`));
                }
            }
        }
        
        const updateQuery = {
            $set: {
                status: 'inscripcion_abierta',
                'structure.grupos': {},
                'structure.calendario': {},
                'structure.eliminatorias': { rondaActual: null },
            }
        };
        await db.collection('tournaments').updateOne({ _id: tournament._id }, updateQuery);
        
        const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
        await updatePublicMessages(client, updatedTournament);
        await updateTournamentManagementThread(client, updatedTournament);

    } catch (error) {
        console.error(`Error crítico al revertir el sorteo para ${tournamentShortId}:`, error);
        throw error;
    } finally {
        await setBotBusy(false);
    }
}
export async function notifyCastersOfNewTeam(client, tournament, teamData) {
    if (!tournament.discordMessageIds.casterThreadId) return;

    try {
        const casterThread = await client.channels.fetch(tournament.discordMessageIds.casterThreadId);
        const embedMessage = createCasterInfoEmbed(teamData, tournament);
        await casterThread.send(embedMessage);
    } catch (e) {
        if (e.code !== 10003) {
            console.error(`Error al notificar a los casters para el torneo ${tournament.shortId}:`, e);
        }
    }
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
    } finally { 
        await setBotBusy(false); 
    }
}
async function cleanupTournament(client, tournament) {
    const { discordChannelIds, discordMessageIds } = tournament;
    const deleteResourceSafe = async (resourceId) => {
        if (!resourceId) return;
        try { const resource = await client.channels.fetch(resourceId).catch(() => null); if(resource) await resource.delete(); }
        catch (err) { if (err.code !== 10003) console.error(`Fallo al borrar recurso ${resourceId}: ${err.message}`); }
    };
    for (const channelId of Object.values(discordChannelIds)) { await deleteResourceSafe(channelId); }
    for (const threadId of [discordMessageIds.managementThreadId, discordMessageIds.notificationsThreadId, discordMessageIds.casterThreadId]) { await deleteResourceSafe(threadId); }
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
        await db.collection('drafts').deleteMany({});
    } catch (error) {
        console.error("Error crítico durante el reseteo forzoso:", error);
    } finally {
        await setBotBusy(false);
    }
}
export async function updatePublicMessages(client, entity) {
    const db = getDb();
    const isDraft = entity.players !== undefined;
    const collectionName = isDraft ? 'drafts' : 'tournaments';
    const latestState = await db.collection(collectionName).findOne({ _id: entity._id });
    
    if (!latestState || !latestState.discordMessageIds || !latestState.discordMessageIds.statusMessageId) return;

    const editMessageSafe = async (channelId, messageId, content) => {
        if (!channelId || !messageId) return;
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            await message.edit(content);
        } catch (e) {
            if (e.code !== 10008 && e.code !== 10003) {
                console.warn(`Falla al actualizar mensaje ${messageId}: ${e.message}`);
            }
        }
    };

    if (collectionName === 'tournaments') {
        await editMessageSafe(CHANNELS.TORNEOS_STATUS, latestState.discordMessageIds.statusMessageId, createTournamentStatusEmbed(latestState));
        await editMessageSafe(latestState.discordChannelIds.infoChannelId, latestState.discordMessageIds.classificationMessageId, createClassificationEmbed(latestState));
        await editMessageSafe(latestState.discordChannelIds.infoChannelId, latestState.discordMessageIds.calendarMessageId, createCalendarEmbed(latestState));
    } else { // Drafts
        await editMessageSafe(CHANNELS.TORNEOS_STATUS, latestState.discordMessageIds.statusMessageId, createDraftStatusEmbed(latestState));
    }
}
export async function startGroupStage(client, guild, tournament) {
    await setBotBusy(true);
    try {
        const db = getDb();
        let currentTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
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

        postTournamentUpdate(finalTournamentState).catch(console.error);

    } catch (error) { console.error(`Error durante el sorteo del torneo ${tournament.shortId}:`, error);
    } finally { 
        await setBotBusy(false); 
    }
}
async function promoteFromWaitlist(client, tournamentShortId, count) {
    const db = getDb();
    const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!tournament || !tournament.teams.reserva) return;

    const waitlistedTeams = Object.values(tournament.teams.reserva).sort((a, b) => new Date(a.inscritoEn) - new Date(b.inscritoEn));
    const teamsToPromote = waitlistedTeams.slice(0, count);

    if (teamsToPromote.length === 0) return;

    for (const teamData of teamsToPromote) {
        await approveTeam(client, tournament, teamData);
    }
}
export async function updateTournamentConfig(client, tournamentShortId, newConfig) {
    const db = getDb();
    const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!tournament) throw new Error('Torneo no encontrado');
    
    const oldSize = tournament.config.format.size;
    
    const updatedConfig = { ...tournament.config, ...newConfig };
    if (newConfig.formatId) { 
        updatedConfig.format = TOURNAMENT_FORMATS[newConfig.formatId]; 
    }
    
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { config: updatedConfig } });
    
    const newSize = updatedConfig.format.size;

    if (newSize > oldSize && !tournament.config.isPaid) {
        const slotsToFill = newSize - oldSize;
        await promoteFromWaitlist(client, tournamentShortId, slotsToFill);
    }
    
    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    await updatePublicMessages(client, updatedTournament); 
    await updateTournamentManagementThread(client, updatedTournament);
}
export async function addTeamToWaitlist(client, tournament, teamData) {
    const db = getDb();
    
    await db.collection('tournaments').updateOne(
        { _id: tournament._id },
        { $set: { [`teams.reserva.${teamData.capitanId}`]: teamData } }
    );
    
    const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
    if (notificationsThread) {
        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('📝 Nueva Inscripción en Reserva')
            .setDescription(`El equipo **${teamData.nombre}** (Cap: ${teamData.capitanTag}) se ha inscrito en la lista de reserva.`)
            .setFooter({ text: `Torneo: ${tournament.nombre}`});
        await notificationsThread.send({ embeds: [embed] });
    }
}
export async function requestUnregister(client, tournament, userId) {
    const db = getDb();
    const team = tournament.teams.aprobados[userId];
    if (!team) return { success: false, message: "No estás inscrito en este torneo." };

    const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
    if (!notificationsThread) return { success: false, message: "Error interno del bot." };

    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('👋 Solicitud de Baja')
        .setDescription(`El capitán **${team.capitanTag}** del equipo **${team.nombre}** solicita darse de baja del torneo.`)
        .setFooter({ text: `ID del Capitán: ${userId}`});

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_unregister_approve:${tournament.shortId}:${userId}`).setLabel('Aprobar Baja').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`admin_unregister_reject:${tournament.shortId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
    );

    await notificationsThread.send({ embeds: [embed], components: [row] });

    return { success: true, message: "✅ Tu solicitud de baja ha sido enviada a los administradores. Recibirás una notificación con su decisión." };
}
export async function notifyCaptainsOfChanges(client, tournament) {
    const approvedCaptains = Object.values(tournament.teams.aprobados);
    if (approvedCaptains.length === 0) {
        return { success: true, message: "✅ No hay capitanes inscritos a los que notificar." };
    }
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`📢 Actualización del Torneo / Tournament Update: ${tournament.nombre}`)
        .setDescription('🇪🇸 La configuración del torneo ha cambiado.\n🇬🇧 The tournament configuration has changed.')
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
        try { const user = await client.users.fetch(team.capitanId); await user.send({ embeds: [embed] }); notifiedCount++;
        } catch (e) { console.warn(`No se pudo notificar al capitán ${team.capitanTag}`); }
    }
    return { success: true, message: `✅ Se ha enviado la notificación a ${notifiedCount} de ${approvedCaptains.length} capitanes.` };
}
export async function createNewDraft(client, guild, name, shortId, config) {
    await setBotBusy(true);
    try {
        const db = getDb();
        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);
        if (!arbitroRole) throw new Error("El rol de Árbitro no fue encontrado.");

        const draftChannelPermissions = [
            { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.SendMessages] }
        ];

        const draftChannel = await guild.channels.create({
            name: `📝-${shortId}`,
            type: ChannelType.GuildText,
            parent: TOURNAMENT_CATEGORY_ID,
            permissionOverwrites: draftChannelPermissions,
        });

        const newDraft = {
            _id: new ObjectId(), shortId, guildId: guild.id, name, status: 'inscripcion',
            config: { 
                isPaid: config.isPaid, 
                entryFee: config.entryFee || 0, 
                prizeCampeon: config.prizeCampeon || 0,
                prizeFinalista: config.prizeFinalista || 0,
                allowReserves: !config.isPaid 
            },
            captains: [], pendingCaptains: {}, players: [], reserves: [], pendingPayments: {},
            selection: { turn: 0, order: [], currentPick: 1 },
            discordChannelId: draftChannel.id,
            discordMessageIds: {
                statusMessageId: null, managementThreadId: null,
                mainInterfacePlayerMessageId: null, mainInterfaceTeamsMessageId: null,
                turnOrderMessageId: null, notificationsThreadId: null
            }
        };
        
        const [playersEmbed, teamsEmbed, turnOrderEmbed] = createDraftMainInterface(newDraft);
        const playersMessage = await draftChannel.send({ embeds: [playersEmbed] });
        const teamsMessage = await draftChannel.send({ embeds: [teamsEmbed] });
        const turnOrderMessage = await draftChannel.send({ embeds: [turnOrderEmbed] });
        
        newDraft.discordMessageIds.mainInterfacePlayerMessageId = playersMessage.id;
        newDraft.discordMessageIds.mainInterfaceTeamsMessageId = teamsMessage.id;
        newDraft.discordMessageIds.turnOrderMessageId = turnOrderMessage.id;
        
        const globalStatusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        const statusMsg = await globalStatusChannel.send(createDraftStatusEmbed(newDraft));
        newDraft.discordMessageIds.statusMessageId = statusMsg.id;

        const managementParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT);
        const managementThread = await managementParentChannel.threads.create({
            name: `Gestión Draft - ${name.slice(0, 40)}`,
            type: ChannelType.PrivateThread, autoArchiveDuration: 10080
        });
        newDraft.discordMessageIds.managementThreadId = managementThread.id;
        
        const notificationsParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_APPROVALS_PARENT);
        const notificationsThread = await notificationsParentChannel.threads.create({ 
            name: `Avisos Draft - ${name.slice(0, 40)}`, 
            type: ChannelType.PrivateThread, 
            autoArchiveDuration: 10080 
        });
        newDraft.discordMessageIds.notificationsThreadId = notificationsThread.id;

        await db.collection('drafts').insertOne(newDraft);

        if (arbitroRole) {
            for (const member of arbitroRole.members.values()) {
                await managementThread.members.add(member.id).catch(() => {});
                await notificationsThread.members.add(member.id).catch(() => {});
            }
        }
        
        await managementThread.send(createDraftManagementPanel(newDraft, true));

    } catch (error) {
        console.error('[CREATE DRAFT] Ocurrió un error al crear el draft:', error);
        await setBotBusy(false); throw error;
    } finally {
        await setBotBusy(false);
    }
}

export async function startDraftSelection(client, draftShortId) {
    await setBotBusy(true);
    try {
        const db = getDb();
        let draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) throw new Error('Draft no encontrado.');
        if (draft.status !== 'inscripcion') throw new Error('El draft no está en fase de inscripción.');
        
        if (draft.captains.length < 8 || draft.players.length < 88) {
            throw new Error(`No hay suficientes participantes. Se necesitan 8 capitanes y 88 jugadores en total. Actualmente hay ${draft.captains.length} capitanes y ${draft.players.length} jugadores.`);
        }

        const captainIds = draft.captains.map(c => c.userId);
        for (let i = captainIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [captainIds[i], captainIds[j]] = [captainIds[j], captainIds[i]];
        }

        await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $set: { status: 'seleccion', 'selection.order': captainIds, 'selection.turn': 0, 'selection.currentPick': 1 } }
        );
        
        draft = await db.collection('drafts').findOne({ _id: draft._id });
        
        await updateDraftManagementPanel(client, draft);
        await updateDraftMainInterface(client, draft.shortId);
        await updatePublicMessages(client, draft);

        await notifyNextCaptain(client, draft);
    } catch (error) {
        console.error("[DRAFT START SELECTION]", error);
        throw error;
    } finally {
        await setBotBusy(false);
    }
}
export async function notifyNextCaptain(client, draft) {
    const nonCaptainPlayers = draft.players.filter(p => !p.isCaptain);
    const picksToMake = nonCaptainPlayers.length;
    if (draft.selection.currentPick > picksToMake) {
         await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { status: 'finalizado' } });
         console.log(`El draft ${draft.shortId} ha finalizado la selección.`);
         const draftChannel = await client.channels.fetch(draft.discordChannelId);
         await draftChannel.send('**LA SELECCIÓN HA FINALIZADO.** Un administrador generará el torneo en breve.');
         const finalDraftState = await db.collection('drafts').findOne({_id: draft._id});
         await updateDraftManagementPanel(client, finalDraftState);
         await updateDraftMainInterface(client, finalDraftState.shortId);
         await updatePublicMessages(client, finalDraftState);
         return;
    }

    const currentCaptainId = draft.selection.order[draft.selection.turn];
    if (!currentCaptainId) return;

    const draftChannel = await client.channels.fetch(draft.discordChannelId);
    const pickEmbed = createDraftPickEmbed(draft, currentCaptainId);
    await draftChannel.send(pickEmbed);
}
export async function handlePlayerSelection(client, draftShortId, captainId, playerId) {
    const db = getDb();
    await db.collection('drafts').updateOne(
        { shortId: draftShortId, "players.userId": playerId },
        { $set: { "players.$.captainId": captainId } }
    );
    await updateDraftMainInterface(client, draftShortId);
}
export async function updateDraftMainInterface(client, draftShortId) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft || !draft.discordMessageIds.mainInterfacePlayerMessageId) return;

    try {
        const draftChannel = await client.channels.fetch(draft.discordChannelId);
        const [playersEmbed, teamsEmbed, turnOrderEmbed] = createDraftMainInterface(draft);

        const playersMessage = await draftChannel.messages.fetch(draft.discordMessageIds.mainInterfacePlayerMessageId);
        await playersMessage.edit({ embeds: [playersEmbed] });

        const teamsMessage = await draftChannel.messages.fetch(draft.discordMessageIds.mainInterfaceTeamsMessageId);
        await teamsMessage.edit({ embeds: [teamsEmbed] });
        
        if (draft.discordMessageIds.turnOrderMessageId) {
            const turnOrderMessage = await draftChannel.messages.fetch(draft.discordMessageIds.turnOrderMessageId);
            await turnOrderMessage.edit({ embeds: [turnOrderEmbed] });
        }
    } catch (error) {
        if (error.code !== 10003 && error.code !== 10008) {
            console.warn(`[WARN] No se pudo actualizar la interfaz del draft ${draftShortId}. El canal o los mensajes podrían haber sido borrados.`);
        }
    }
}
export async function advanceDraftTurn(client, draftShortId) {
    const db = getDb();
    let draft = await db.collection('drafts').findOne({ shortId: draftShortId });

    const round = Math.floor((draft.selection.currentPick - 1) / draft.captains.length);
    let nextTurnIndex = draft.selection.turn;

    const isTurnaroundPick = (draft.selection.currentPick) % draft.captains.length === 0;

    if (!isTurnaroundPick) {
        if (round % 2 === 0) {
            nextTurnIndex++;
        } else {
            nextTurnIndex--;
        }
    }
    
    await db.collection('drafts').updateOne(
        { _id: draft._id },
        { 
            $set: { "selection.turn": nextTurnIndex },
            $inc: { "selection.currentPick": 1 },
        }
    );

    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await notifyNextCaptain(client, updatedDraft);
}
