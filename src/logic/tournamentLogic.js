// src/logic/tournamentLogic.js
import { getDb, getBotSettings } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, ARBITRO_ROLE_ID, TOURNAMENT_CATEGORY_ID, CASTER_ROLE_ID, TEAM_CHANNELS_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed, createTournamentManagementPanel, createTeamListEmbed, createCasterInfoEmbed, createDraftStatusEmbed, createDraftManagementPanel, createDraftMainInterface, createCaptainControlPanel } from '../utils/embeds.js';
import { updateAdminPanel, updateTournamentManagementThread, updateDraftManagementThread } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { postTournamentUpdate } from '../utils/twitter.js';

/**
 * Actualiza los embeds principales de la interfaz de un draft (jugadores, equipos, orden).
 * @param {import('discord.js').Client} client El cliente de Discord.
 * @param {string} draftShortId El ID corto del draft a actualizar.
 */
export async function updateDraftMainInterface(client, draftShortId) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) {
        console.error(`[Interface Update] No se encontró el draft ${draftShortId} para actualizar.`);
        return;
    }

    const { discordChannelId, discordMessageIds } = draft;
    if (!discordChannelId || !discordMessageIds) return;

    try {
        const channel = await client.channels.fetch(discordChannelId);
        if (!channel) return;

        const [playersEmbed, teamsEmbed, turnOrderEmbed] = createDraftMainInterface(draft);

        if (discordMessageIds.mainInterfacePlayerMessageId) {
            const playerMsg = await channel.messages.fetch(discordMessageIds.mainInterfacePlayerMessageId).catch(() => null);
            if (playerMsg) await playerMsg.edit({ embeds: [playersEmbed] });
        }
        
        if (discordMessageIds.mainInterfaceTeamsMessageId) {
            const teamMsg = await channel.messages.fetch(discordMessageIds.mainInterfaceTeamsMessageId).catch(() => null);
            if (teamMsg) await teamMsg.edit({ embeds: [teamsEmbed] });
        }

        if (discordMessageIds.turnOrderMessageId) {
            const turnMsg = await channel.messages.fetch(discordMessageIds.turnOrderMessageId).catch(() => null);
            if (turnMsg) await turnMsg.edit({ embeds: [turnOrderEmbed] });
        }

    } catch (error) {
        if (error.code !== 10003 && error.code !== 10008) { // Canal o mensaje no encontrado
            console.error(`[Interface Update] Error al actualizar la interfaz principal para el draft ${draftShortId}:`, error);
        }
    }
}

// --- PEGA ESTE BLOQUE COMPLETO ---

export async function handlePlayerSelection(client, draftShortId, captainId, selectedPlayerId) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    const player = draft.players.find(p => p.userId === selectedPlayerId);
    const captain = draft.captains.find(c => c.userId === captainId);

    // Lógica de comprobación de máximos
    const settings = await getBotSettings();
    const maxQuotas = Object.fromEntries(
        settings.draftMaxQuotas.split(',').map(q => q.split(':'))
    );
    const teamPlayers = draft.players.filter(p => p.captainId === captainId);
    const primaryPosOfNewPlayer = player.primaryPosition;
    if (maxQuotas[primaryPosOfNewPlayer]) {
        const max = parseInt(maxQuotas[primaryPosOfNewPlayer]);
        const currentCount = teamPlayers.filter(p => p.primaryPosition === primaryPosOfNewPlayer).length;
        if (currentCount >= max) {
            throw new Error(`Ya has alcanzado el máximo de ${max} jugadores para la posición primaria ${primaryPosOfNewPlayer}.`);
        }
    }

    await db.collection('drafts').updateOne(
        { shortId: draftShortId, "players.userId": selectedPlayerId },
        { $set: { "players.$.captainId": captainId } }
    );
    
    // Notificaciones y Anuncios
    if (/^\d+$/.test(selectedPlayerId)) {
        try {
            const playerUser = await client.users.fetch(selectedPlayerId);
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle(`¡Has sido seleccionado en el Draft!`)
                .setDescription(`¡Enhorabuena! Has sido elegido por el equipo **${captain.teamName}** (Capitán: ${captain.userName}) en el draft **${draft.name}**.`);
            await playerUser.send({ embeds: [embed] });
        } catch (e) {
            console.warn(`No se pudo notificar al jugador seleccionado ${selectedPlayerId}`);
        }
    }

    try {
        const draftChannel = await client.channels.fetch(draft.discordChannelId);
        const announcementEmbed = new EmbedBuilder()
            .setColor('#3498db')
            .setDescription(`**Pick #${draft.selection.currentPick}**: El equipo **${captain.teamName}** ha seleccionado a **${player.psnId}**`);

        const announcementMessage = await draftChannel.send({ embeds: [announcementEmbed] });

        setTimeout(() => {
            announcementMessage.delete().catch(err => {
                if (err.code !== 10008) {
                    console.error("Error al intentar borrar el mensaje de anuncio de pick:", err);
                }
            });
        }, 60000);

    } catch (e) {
        console.error("No se pudo enviar o programar el borrado del anuncio de pick:", e);
    }
    
    const updatedTeamPlayers = [...teamPlayers, player];
    if (updatedTeamPlayers.length === 11) {
        postTournamentUpdate('ROSTER_COMPLETE', { captain, players: updatedTeamPlayers, draft }).catch(console.error);
    }
}

export async function approveDraftCaptain(client, draft, captainData) {
    const db = getDb();

    const captainAsPlayer = {
        userId: captainData.userId,
        userName: captainData.userName,
        psnId: captainData.psnId,
        eafcTeamName: captainData.eafcTeamName,
        twitter: captainData.twitter,
        primaryPosition: captainData.position,
        secondaryPosition: captainData.position,
        currentTeam: captainData.teamName,
        isCaptain: true,
        captainId: captainData.userId
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

    if (/^\d+$/.test(captainData.userId)) {
        try {
            const user = await client.users.fetch(captainData.userId);
            
            const settings = await getBotSettings();
            const maxQuotasText = settings.draftMaxQuotas.split(',').join('\n').replace(/:/g, ': ');
            
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle(`✅ Aprobado para el Draft: ${draft.name}`)
                .setDescription(
                    `¡Enhorabuena! Tu solicitud para ser capitán del equipo **${captainData.teamName}** ha sido **aprobada**.\n\n` +
                    `Ya apareces en la lista oficial. **IMPORTANTE:** Durante el draft, deberás respetar los siguientes límites de jugadores por posición:\n\n` +
                    "```\n" + maxQuotasText + "\n```"
                );

            await user.send({ embeds: [embed] });
        } catch (e) { console.warn(`No se pudo enviar MD de aprobación de draft al capitán ${captainData.userId}:`, e.message); }
    }
    
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);

    postTournamentUpdate('NEW_CAPTAIN_APPROVED', { captainData, draft: updatedDraft }).catch(console.error);
}

// --- FIN DEL BLOQUE PEGADO ---
export async function kickPlayerFromDraft(client, draft, userIdToKick) {
    const db = getDb();
    const isCaptain = draft.captains.some(c => c.userId === userIdToKick);

    let updateQuery;
    if (isCaptain) {
        updateQuery = { $pull: { captains: { userId: userIdToKick }, players: { userId: userIdToKick } } };
    } else {
        updateQuery = { $pull: { players: { userId: userIdToKick } } };
    }

    await db.collection('drafts').updateOne({ _id: draft._id }, updateQuery);

    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
}


export async function approveUnregisterFromDraft(client, draft, userIdToUnregister) {
    await kickPlayerFromDraft(client, draft, userIdToUnregister);
    if (/^\d+$/.test(userIdToUnregister)) {
        try {
            const user = await client.users.fetch(userIdToUnregister);
            await user.send(`✅ Tu solicitud de baja del draft **${draft.name}** ha sido **aprobada**.`);
        } catch (e) {
            console.warn('No se pudo notificar al usuario de la baja de draft aprobada');
        }
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
        await fullCleanupDraft(client, draft);

    } catch (error) {
        console.error(`Error crítico al finalizar el draft ${draft.shortId}:`, error);
    } finally {
        await setBotBusy(false);
    }
}

async function fullCleanupDraft(client, draft) {
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
        await updateCaptainControlPanel(client, finalDraftState);
        
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
            const teamPlayers = draft.players.filter(p => p.captainId === captain.userId);
            const teamData = {
                id: captain.userId,
                nombre: captain.teamName,
                eafcTeamName: captain.eafcTeamName,
                capitanId: captain.userId,
                capitanTag: captain.userName,
                coCaptainId: null,
                coCaptainTag: null,
                bandera: '🏳️',
                paypal: null, 
                streamChannel: captain.streamChannel,
                twitter: captain.twitter,
                inscritoEn: new Date(),
                players: teamPlayers 
            };
            approvedTeams[captain.userId] = teamData;
        }

        const tournamentName = `Torneo Draft - ${draft.name}`;
        const tournamentShortId = `draft-${draft.shortId}`;
        
        const format = TOURNAMENT_FORMATS[formatId];
        if (!format) throw new Error(`Formato de torneo inválido: ${formatId}`);

        const config = {
            formatId: formatId,
            format: format, 
            isPaid: draft.config.isPaid,
            entryFee: draft.config.entryFee,
            prizeCampeon: draft.config.prizeCampeon,
            prizeFinalista: draft.config.prizeFinalista,
            startTime: null
        };
        
        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID);
        const casterRole = await guild.roles.fetch(CASTER_ROLE_ID).catch(() => null);

        const participantsAndStaffPermissions = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ...Object.keys(approvedTeams)
                .filter(id => /^\d+$/.test(id))
                .map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel] }))
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
        
        const teamCategory = await guild.channels.fetch(TEAM_CHANNELS_CATEGORY_ID).catch(() => null);
        if (teamCategory) {
            for (const team of Object.values(newTournament.teams.aprobados)) {
                const teamMembersIds = team.players.map(p => p.userId).filter(id => /^\d+$/.test(id));
                const permissions = [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel] },
                    ...teamMembersIds.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel] }))
                ];
                
                const textChannel = await guild.channels.create({
                    name: `💬-${team.nombre.replace(/\s+/g, '-').toLowerCase()}`,
                    type: ChannelType.GuildText,
                    parent: teamCategory,
                    permissionOverwrites: permissions
                });

                await guild.channels.create({
                    name: `🔊 ${team.nombre}`,
                    type: ChannelType.GuildVoice,
                    parent: teamCategory,
                    permissionOverwrites: permissions
                });
                
                const mentionString = teamMembersIds.map(id => `<@${id}>`).join(' ');
                await textChannel.send({
                    content: `### ¡Bienvenido, equipo ${team.nombre}!
Este es vuestro canal privado para coordinaros.

**Miembros:** ${mentionString}`
                });
            }
        }
        
        for (const member of arbitroRole.members.values()) { await managementThread.members.add(member.id).catch(()=>{}); await notificationsThread.members.add(member.id).catch(()=>{}); }
        if (casterRole) { for (const member of casterRole.members.values()) { await casterThread.members.add(member.id).catch(()=>{}); } }
        
        await managementThread.send(createTournamentManagementPanel(newTournament, true));

        await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { status: 'torneo_generado' } });
        
        for (const teamData of Object.values(newTournament.teams.aprobados)) {
            await notifyCastersOfNewTeam(client, newTournament, teamData);
        }
        
        const draftChannel = await client.channels.fetch(draft.discordChannelId).catch(() => null);
        if (draftChannel) {
             await draftChannel.send('✅ **Torneo generado con éxito.** Este canal permanecerá como archivo para consultar las plantillas de los equipos.');
        }

        const finalDraftState = await db.collection('drafts').findOne({_id: draft._id});
        await updateCaptainControlPanel(client, finalDraftState);
        await updateDraftManagementPanel(client, finalDraftState);

        return newTournament;

    } catch (error) {
        console.error('[CREATE TOURNAMENT FROM DRAFT] Error:', error);
        await setBotBusy(false);
        throw error;
    } finally {
        await setBotBusy(false);
    }
}

export async function confirmPrizePayment(client, userId, prizeType, tournament) {
    if (/^\d+$/.test(userId)) {
        try {
            const user = await client.users.fetch(userId);
            await user.send(`💰 ¡Buenas noticias! Tu premio de **${prizeType}** del torneo **${tournament.nombre}** ha sido marcado como **pagado**. ¡Gracias por participar!`);
            return { success: true };
        } catch (e) {
            console.warn(`No se pudo notificar al usuario ${userId} del pago del premio.`);
            return { success: false, error: e };
        }
    }
}

export async function createNewDraft(client, guild, name, shortId, config) {
    await setBotBusy(true);
    try {
        const db = getDb();
        const existingDraft = await db.collection('drafts').findOne({ shortId });
        if (existingDraft) {
            throw new Error(`Ya existe un draft con el nombre o ID "${name}". Por favor, elige un nombre único.`);
        }

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
                entryFee: config.isPaid ? config.entryFee : 0, 
                prizeCampeon: config.isPaid ? config.prizeCampeon : 0,
                prizeFinalista: config.isPaid ? config.prizeFinalista : 0,
            },
            captains: [], pendingCaptains: {}, players: [], pendingPayments: {}, 
            selection: { turn: 0, order: [], currentPick: 1, isPicking: false, activeInteractionId: null },
            discordChannelId: draftChannel.id,
            discordMessageIds: {
                statusMessageId: null, managementThreadId: null,
                mainInterfacePlayerMessageId: null, mainInterfaceTeamsMessageId: null,
                turnOrderMessageId: null, notificationsThreadId: null,
                captainControlPanelMessageId: null
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

export async function startDraftSelection(client, guild, draftShortId) {
    await setBotBusy(true);
    try {
        const db = getDb();
        let draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) throw new Error('Draft no encontrado.');
        if (draft.status !== 'inscripcion') throw new Error('El draft no está en fase de inscripción.');
        
        // --- INICIO DE LA COMPROBACIÓN DE MÍNIMOS ---
        const settings = await getBotSettings();
        const minQuotas = Object.fromEntries(
            settings.draftMinQuotas.split(',').map(q => q.split(':'))
        );

        const positionCounts = {};
        Object.keys(minQuotas).forEach(p => positionCounts[p] = 0);

        const allPlayers = draft.players;
        for (const player of allPlayers) {
            // Contamos la posición primaria
            if (positionCounts[player.primaryPosition] !== undefined) {
                positionCounts[player.primaryPosition]++;
            }
            // Contamos la posición secundaria si es diferente y existe
            if (player.secondaryPosition && player.secondaryPosition !== 'NONE' && player.secondaryPosition !== player.primaryPosition) {
                 if (positionCounts[player.secondaryPosition] !== undefined) {
                    positionCounts[player.secondaryPosition]++;
                }
            }
        }

        const missingPositions = [];
        for (const pos in minQuotas) {
            const required = parseInt(minQuotas[pos]);
            const current = positionCounts[pos] || 0;
            if (current < required) {
                missingPositions.push(`${pos} (necesarios: ${required}, disponibles: ${current})`);
            }
        }
        if (missingPositions.length > 0) {
            throw new Error(`No se cumplen las cuotas mínimas. Faltan jugadores para: ${missingPositions.join(', ')}.`);
        }
        // --- FIN DE LA COMPROBACIÓN DE MÍNIMOS ---

        const captainIds = draft.captains.map(c => c.userId);
        for (let i = captainIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [captainIds[i], captainIds[j]] = [captainIds[j], captainIds[i]];
        }

        await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $set: { status: 'seleccion', 'selection.order': captainIds, 'selection.turn': 0, 'selection.currentPick': 1, 'selection.isPicking': false, 'selection.activeInteractionId': null } }
        );
        
        draft = await db.collection('drafts').findOne({ _id: draft._id });
        
        const draftChannel = await client.channels.fetch(draft.discordChannelId);
        const panelContent = createCaptainControlPanel(draft);
        const panelMessage = await draftChannel.send(panelContent);

        await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $set: { 'discordMessageIds.captainControlPanelMessageId': panelMessage.id } }
        );

        await updateDraftManagementPanel(client, draft);
        await updatePublicMessages(client, draft);
        await updateDraftMainInterface(client, draft.shortId);

    } catch (error) {
        console.error("[DRAFT START SELECTION]", error);
        await setBotBusy(false);
        throw error;
    } finally {
        await setBotBusy(false);
    }
}

export async function updateCaptainControlPanel(client, draft) {
    if (!draft || !draft.discordMessageIds.captainControlPanelMessageId) return;

    try {
        const channel = await client.channels.fetch(draft.discordChannelId);
        const message = await channel.messages.fetch(draft.discordMessageIds.captainControlPanelMessageId);
        
        const content = createCaptainControlPanel(draft);
        await message.edit(content);
    } catch (e) {
        if (e.code !== 10008 && e.code !== 10003) {
             console.error(`Error al actualizar el panel de control de capitanes para el draft ${draft.shortId}:`, e);
        }
    }
}

export async function advanceDraftTurn(client, draftShortId) {
    const db = getDb();
    let draft = await db.collection('drafts').findOne({ shortId: draftShortId });

    const totalPicks = 80;
    if (draft.selection.currentPick >= totalPicks) {
         await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { status: 'finalizado', "selection.isPicking": false, "selection.activeInteractionId": null } });
         const finalDraftState = await db.collection('drafts').findOne({_id: draft._id});
         
         await updateDraftManagementPanel(client, finalDraftState);
         await updateDraftMainInterface(client, finalDraftState.shortId);
         await updatePublicMessages(client, finalDraftState);
         await updateCaptainControlPanel(client, finalDraftState);
         return;
    }

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
            $set: { "selection.turn": nextTurnIndex, "selection.isPicking": false, "selection.activeInteractionId": null },
            $inc: { "selection.currentPick": 1 },
        }
    );

    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updateCaptainControlPanel(client, updatedDraft);
}

export async function createNewTournament(client, guild, name, shortId, config) {
    await setBotBusy(true);
    let createdResources = { channels: [], threads: [], messages: [] };

    try {
        const db = getDb();
        const format = TOURNAMENT_FORMATS[config.formatId];
        if (!format) return { success: false, message: `Formato de torneo inválido: ${config.formatId}` };
        
        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);
        if (!arbitroRole) return { success: false, message: "El rol de Árbitro no fue encontrado." };
        const casterRole = await guild.roles.fetch(CASTER_ROLE_ID).catch(() => null);

        const participantsAndStaffPermissions = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        let infoChannel, matchesChannel, chatChannel;
        try {
            infoChannel = await guild.channels.create({ name: `🏆-${shortId}-info`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] }] });
            matchesChannel = await guild.channels.create({ name: `⚽-${shortId}-partidos`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });
            chatChannel = await guild.channels.create({ name: `💬-${shortId}-chat`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });
            createdResources.channels.push(infoChannel.id, matchesChannel.id, chatChannel.id);
            console.log(`[CREATE] Canales principales creados para ${shortId}.`);
        } catch (error) {
            console.error(`[CREATE] ERROR AL CREAR CANALES PRINCIPALES:`, error);
            await cleanupFailedCreation(client, createdResources);
            return { success: false, message: "Fallo al crear los canales base del torneo. ¿La categoría está llena?" };
        }

        const newTournament = {
            _id: new ObjectId(), shortId, guildId: guild.id, nombre: name, status: 'inscripcion_abierta',
            config: { formatId: config.formatId, format, isPaid: config.isPaid, entryFee: config.isPaid ? config.entryFee : 0, prizeCampeon: config.isPaid ? config.prizeCampeon : 0, prizeFinalista: config.isPaid ? config.prizeFinalista : 0, enlacePaypal: config.isPaid ? config.enlacePaypal : null, startTime: config.startTime || null },
            teams: { pendientes: {}, aprobados: {}, reserva: {}, coCapitanes: {} },
            structure: { grupos: {}, calendario: {}, eliminatorias: { rondaActual: null } },
            discordChannelIds: { infoChannelId: infoChannel.id, matchesChannelId: matchesChannel.id, chatChannelId: chatChannel.id },
            discordMessageIds: { statusMessageId: null, classificationMessageId: null, calendarMessageId: null, managementThreadId: null, notificationsThreadId: null, casterThreadId: null }
        };

        const globalStatusChannel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        const statusMsg = await globalStatusChannel.send(createTournamentStatusEmbed(newTournament));
        createdResources.messages.push({ channelId: globalStatusChannel.id, messageId: statusMsg.id });
        const classificationMsg = await infoChannel.send(createClassificationEmbed(newTournament));
        const calendarMsg = await infoChannel.send(createCalendarEmbed(newTournament));
        newTournament.discordMessageIds = { ...newTournament.discordMessageIds, statusMessageId: statusMsg.id, classificationMessageId: classificationMsg.id, calendarMessageId: calendarMsg.id };
        console.log(`[CREATE] Mensajes de estado e info enviados para ${shortId}.`);

        let managementThread, notificationsThread, casterThread;
        try {
            const managementParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT);
            managementThread = await managementParentChannel.threads.create({ name: `Gestión - ${name.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
            createdResources.threads.push(managementThread.id);
            newTournament.discordMessageIds.managementThreadId = managementThread.id;

            const notificationsParentChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_APPROVALS_PARENT);
            notificationsThread = await notificationsParentChannel.threads.create({ name: `Avisos - ${name.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
            createdResources.threads.push(notificationsThread.id);
            newTournament.discordMessageIds.notificationsThreadId = notificationsThread.id;

            const casterParentChannel = await client.channels.fetch(CHANNELS.CASTER_HUB_ID);
            casterThread = await casterParentChannel.threads.create({ name: `Casters - ${name.slice(0, 50)}`, type: ChannelType.PrivateThread, autoArchiveDuration: 10080 });
            createdResources.threads.push(casterThread.id);
            newTournament.discordMessageIds.casterThreadId = casterThread.id;
            console.log(`[CREATE] Hilos privados creados para ${shortId}.`);
        } catch (error) {
            console.error(`[CREATE] ERROR AL CREAR HILOS PRIVADOS:`, error);
            await cleanupFailedCreation(client, createdResources);
            return { success: false, message: "Fallo al crear los hilos de gestión." };
        }
        
        await db.collection('tournaments').insertOne(newTournament);
        console.log(`[CREATE] Torneo ${shortId} insertado en la base de datos.`);

        if (arbitroRole) {
            for (const member of arbitroRole.members.values()) {
                await managementThread.members.add(member.id).catch(()=>{});
                await notificationsThread.members.add(member.id).catch(()=>{});
            }
        }
        if (casterRole) {
            for (const member of casterRole.members.values()) {
                 await casterThread.members.add(member.id).catch(()=>{});
            }
        }
        
        await managementThread.send(createTournamentManagementPanel(newTournament, false));
        console.log(`[CREATE] Panel de gestión enviado para ${shortId}.`);

            // --- INICIO DE LA MODIFICACIÓN: Tarea de Twitter en segundo plano ---
    // No usamos 'await' para que el bot pueda continuar sin esperar a Twitter.
    (async () => {
        // Obtenemos los ajustes para ver si Twitter está activado
        const settings = await getBotSettings();
        if (!settings.twitterEnabled) {
            // Si está desactivado, no hacemos nada y no se notifica.
            return;
        }

        // Buscamos el hilo de notificaciones para enviar los mensajes de estado
        const notificationsThread = await client.channels.fetch(newTournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (!notificationsThread) return;

        // Enviamos el primer mensaje: "Intentando..."
        const statusMessage = await notificationsThread.send('⏳ Intentando generar el tweet de anuncio...');

        // Llamamos a la función de Twitter y esperamos su resultado (éxito o fallo)
        const finalTournament = await db.collection('tournaments').findOne({ _id: newTournament._id });
        const result = await postTournamentUpdate('INSCRIPCION_ABIERTA', finalTournament);

        // Editamos el mensaje anterior según el resultado
        if (result && result.success) {
            await statusMessage.edit('✅ Tweet de anuncio generado con éxito.');
        } else {
            await statusMessage.edit('❌ Hubo un error al intentar generar el tweet de anuncio.');
            console.error("Fallo en postTournamentUpdate:", result?.error);
        }
    })();
    // --- FIN DE LA MODIFICACIÓN ---
        
        await setBotBusy(false);
        return { success: true, tournament: newTournament };

    } catch (error) {
        console.error(`[CREATE] OCURRIÓ UN ERROR CRÍTICO INESPERADO en createNewTournament:`, error);
        await cleanupFailedCreation(client, createdResources);
        await setBotBusy(false);
        return { success: false, message: "Un error crítico ocurrió. Revisa los logs." };
    }
}

async function cleanupFailedCreation(client, resources) {
    console.log("[CLEANUP] Iniciando limpieza de recursos por creación fallida...");
    const deleteChannel = async (id) => {
        if (!id) return;
        try {
            const channel = await client.channels.fetch(id).catch(()=>null);
            if (channel) await channel.delete('Limpieza por creación de torneo fallida.');
        } catch(e) { console.warn(`No se pudo limpiar el canal ${id}: ${e.message}`); }
    };
    for(const id of [...resources.channels, ...resources.threads]) {
        await deleteChannel(id);
    }
    for(const msg of resources.messages) {
        try {
            const channel = await client.channels.fetch(msg.channelId).catch(()=>null);
            if(channel) await channel.messages.delete(msg.messageId).catch(()=>{});
        } catch(e) { console.warn(`No se pudo limpiar el mensaje ${msg.messageId}`); }
    }
    console.log("[CLEANUP] Limpieza completada.");
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
        
        postTournamentUpdate('GROUP_STAGE_START', finalTournamentState).catch(console.error);

    } catch (error) { console.error(`Error durante el sorteo del torneo ${tournament.shortId}:`, error);
    } finally { 
        await setBotBusy(false); 
    }
}

export async function approveTeam(client, tournament, teamData) {
    const db = getDb();
    let latestTournament = await db.collection('tournaments').findOne({_id: tournament._id});
    if (!latestTournament.teams.aprobados) latestTournament.teams.aprobados = {};
    if (!latestTournament.teams.reserva) latestTournament.teams.reserva = {};

    const maxTeams = latestTournament.config.format.size;
    const currentApprovedTeamsCount = Object.keys(latestTournament.teams.aprobados).length;

    if (currentApprovedTeamsCount < maxTeams) {
        // Add to approved teams
        latestTournament.teams.aprobados[teamData.capitanId] = teamData;
        if (latestTournament.teams.pendientes[teamData.capitanId]) delete latestTournament.teams.pendientes[teamData.capitanId];
        if (latestTournament.teams.reserva[teamData.capitanId]) delete latestTournament.teams.reserva[teamData.capitanId];
        
        // Notify captain of approval
        if (/^\d+$/.test(teamData.capitanId)) {
            try {
                const user = await client.users.fetch(teamData.capitanId);
                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle(`✅ Aprobado para ${latestTournament.nombre}`)
                    .setDescription(`🇪🇸 ¡Enhorabuena! Tu equipo **${teamData.nombre}** ha sido **aprobado** y ya forma parte del torneo.\n\n🇬🇧 Congratulations! Your team **${teamData.nombre}** has been **approved** and is now part of the tournament.`);
                await user.send({ embeds: [embed] });

                // Grant chat and matches channel permissions ONLY for approved teams
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

            } catch(e) { 
                console.error(`Error al notificar al capitán ${teamData.capitanId} sobre la aprobación o al dar permisos:`, e); 
            }
        }
        // Notify casters ONLY for approved teams
        await notifyCastersOfNewTeam(client, latestTournament, teamData);

    } else {
        // Add to reserve list
        latestTournament.teams.reserva[teamData.capitanId] = teamData;
        if (latestTournament.teams.pendientes[teamData.capitanId]) delete latestTournament.teams.pendientes[teamData.capitanId];
        // If a team is moved to reserve, it should not be in approved.
        if (latestTournament.teams.aprobados[teamData.capitanId]) delete latestTournament.teams.aprobados[teamData.capitanId];

        // Notify captain of being on reserve list
        if (/^\d+$/.test(teamData.capitanId)) {
            try {
                const user = await client.users.fetch(teamData.capitanId);
                const embed = new EmbedBuilder()
                    .setColor('#f1c40f')
                    .setTitle(`⚠️ En Lista de Reserva para ${latestTournament.nombre}`)
                    .setDescription(`🇪🇸 ¡Hola! Tu equipo **${teamData.nombre}** ha sido añadido a la **lista de reserva** para el torneo **${latestTournament.nombre}**.\nActualmente, el torneo está completo, pero si se libera un espacio, tu equipo será considerado automáticamente.\n\n🇬🇧 Hello! Your team **${teamData.nombre}** has been added to the **reserve list** for the **${latestTournament.nombre}** tournament.\nThe tournament is currently full, but if a spot opens up, your team will be automatically considered.`);
                await user.send({ embeds: [embed] });
            } catch(e) { 
                console.error(`Error al notificar al capitán ${teamData.capitanId} sobre la lista de reserva:`, e); 
            }
        }
    }

    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { 'teams.aprobados': latestTournament.teams.aprobados, 'teams.pendientes': latestTournament.teams.pendientes, 'teams.reserva': latestTournament.teams.reserva }});
    
    const updatedTournament = await db.collection('tournaments').findOne({_id: tournament._id});
    
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

    if (/^\d+$/.test(coCaptainId)) {
        try {
            const chatChannel = await client.channels.fetch(tournament.discordChannelIds.chatChannelId);
            await chatChannel.permissionOverwrites.edit(coCaptainId, { ViewChannel: true, SendMessages: true });
            const matchesChannel = await client.channels.fetch(tournament.discordChannelIds.matchesChannelId);
            await matchesChannel.permissionOverwrites.edit(coCaptainId, { ViewChannel: true, SendMessages: false });
        } catch (e) {
            console.error(`No se pudieron dar permisos al co-capitán ${coCaptainId}:`, e);
        }
    }

    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    await updatePublicMessages(client, updatedTournament);
}

export async function kickTeam(client, tournament, captainId) {
    const db = getDb();
    const teamData = tournament.teams.aprobados[captainId];
    if (!teamData) return;

    if (/^\d+$/.test(captainId)) {
        try {
            const chatChannel = await client.channels.fetch(tournament.discordChannelIds.chatChannelId);
            await chatChannel.permissionOverwrites.delete(captainId, 'Equipo expulsado del torneo');
            const matchesChannel = await client.channels.fetch(tournament.discordChannelIds.matchesChannelId);
            await matchesChannel.permissionOverwrites.delete(captainId, 'Equipo expulsado del torneo');
        } catch (e) { console.error(`No se pudieron revocar los permisos para el capitán ${captainId}:`, e); }
    }

    if (teamData.coCaptainId && /^\d+$/.test(teamData.coCaptainId)) {
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

// ESTE ES EL CÓDIGO NUEVO QUE DEBES PEGAR
export async function endTournament(client, tournament) {
    await setBotBusy(true);
    try {
        const db = getDb();
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });
        const finalTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
        
        await updateTournamentManagementThread(client, finalTournamentState);
        await cleanupTournament(client, finalTournamentState); // Limpia los canales del torneo

        // --- INICIO DE LA MODIFICACIÓN ---
        // Comprobar si este torneo vino de un draft
        if (finalTournamentState.shortId.startsWith('draft-')) {
            console.log(`[DRAFT CLEANUP] Torneo de draft detectado. Iniciando limpieza del draft asociado...`);
            const draftShortId = finalTournamentState.shortId.replace('draft-', '');
            const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

            if (draft) {
                // Llama a la nueva función para borrar los canales de equipo
                await cleanupDraftTeamChannels(client, finalTournamentState);

                // Llama a la función existente para borrar el resto del draft (canal principal, hilos, etc.)
                await fullCleanupDraft(client, draft);

                // Borra el draft de la base de datos
                await db.collection('drafts').deleteOne({ _id: draft._id });
                console.log(`[DRAFT CLEANUP] El draft ${draftShortId} y todos sus recursos han sido eliminados.`);
            } else {
                console.warn(`[DRAFT CLEANUP] Se intentó limpiar el draft ${draftShortId}, pero no se encontró en la base de datos.`);
            }
        }
        // --- FIN DE LA MODIFICACIÓN ---

    } catch (error) { 
        console.error(`Error crítico al finalizar torneo ${tournament.shortId}:`, error);
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
// NUEVA FUNCIÓN para limpiar los canales de equipo de un draft
async function cleanupDraftTeamChannels(client, tournament) {
    console.log(`[CLEANUP] Iniciando limpieza de canales de equipo para el torneo-draft ${tournament.shortId}`);
    try {
        const guild = await client.guilds.fetch(tournament.guildId);
        const teams = Object.values(tournament.teams.aprobados);

        for (const team of teams) {
            const teamNameFormatted = team.nombre.replace(/\s+/g, '-').toLowerCase();
            const textChannelName = `💬-${teamNameFormatted}`;
            const voiceChannelName = `🔊 ${team.nombre}`;

            const textChannel = guild.channels.cache.find(c => c.name === textChannelName);
            if (textChannel) {
                await textChannel.delete(`Limpieza del torneo-draft ${tournament.shortId}`).catch(e => console.warn(`No se pudo borrar el canal de texto ${textChannel.name}: ${e.message}`));
            }

            const voiceChannel = guild.channels.cache.find(c => c.name === voiceChannelName);
            if (voiceChannel) {
                await voiceChannel.delete(`Limpieza del torneo-draft ${tournament.shortId}`).catch(e => console.warn(`No se pudo borrar el canal de voz ${voiceChannel.name}: ${e.message}`));
            }
        }
        console.log(`[CLEANUP] Finalizada la limpieza de canales de equipo para ${tournament.shortId}`);
    } catch (error) {
        console.error(`[CLEANUP] Error crítico al limpiar los canales de equipo del draft:`, error);
    }
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
        if (/^\d+$/.test(team.capitanId)) {
            try { const user = await client.users.fetch(team.capitanId); await user.send({ embeds: [embed] }); notifiedCount++;
            } catch (e) { console.warn(`No se pudo notificar al capitán ${team.capitanTag}`); }
        }
    }
    return { success: true, message: `✅ Se ha enviado la notificación a ${notifiedCount} de ${approvedCaptains.length} capitanes.` };
}

export async function reportPlayer(client, draft, interactorId, teamId, reportedPlayerId, reason) {
    const db = getDb();
    const records = db.collection('player_records');
    const notificationsThread = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId).catch(() => null);
    if (!notificationsThread) throw new Error("No se pudo encontrar el canal de notificaciones del draft.");
    
    const captainAsReporter = draft.players.find(p => p.userId === teamId);
    const reported = draft.players.find(p => p.userId === reportedPlayerId);
    
    if (!captainAsReporter || !reported) {
        throw new Error('No se pudo identificar al capitán o al jugador reportado.');
    }

    const playerRecord = await records.findOne({ userId: reportedPlayerId });
    if (playerRecord && playerRecord.history && playerRecord.history.some(strike => strike.draftId === draft.shortId && strike.reporterId === captainAsReporter.userId)) {
        throw new Error('Este capitán ya ha reportado a este jugador en este draft.');
    }

    const updateResult = await records.findOneAndUpdate(
        { userId: reportedPlayerId },
        {
            $inc: { strikes: 1 },
            $push: {
                history: {
                    strikeId: new ObjectId(),
                    date: new Date(),
                    draftId: draft.shortId,
                    draftName: draft.name,
                    reporterId: captainAsReporter.userId,
                    reporterName: captainAsReporter.psnId,
                    reason,
                }
            }
        },
        { returnDocument: 'after', upsert: true }
    );
    
    const newStrikeCount = updateResult.value?.strikes || 1;

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('⚠️ Nuevo Strike Reportado')
        .setDescription(`El capitán **${captainAsReporter.psnId}** ha reportado a **${reported.psnId}**.`)
        .addFields(
            { name: 'Jugador Reportado', value: `<@${reportedPlayerId}> (${reported.psnId})` },
            { name: 'Razón del Reporte', value: reason },
            { name: 'Total de Strikes del Jugador', value: `**${newStrikeCount}**` }
        )
        .setFooter({text: `Draft: ${draft.name}`});

    await notificationsThread.send({ embeds: [embed] });

    if (newStrikeCount >= 2) {
        const alertEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🚨 ALERTA DE STRIKES 🚨')
            .setDescription(`El jugador <@${reportedPlayerId}> (${reported.psnId}) ha alcanzado **${newStrikeCount} strikes** y está en riesgo de sanción. Se recomienda revisar su caso.`);
        await notificationsThread.send({ content: `<@&${ARBITRO_ROLE_ID}>`, embeds: [alertEmbed] });
    }

    return { success: true, newStrikeCount };
}

export async function requestPlayerKick(client, draft, captainId, playerIdToKick) {
    const db = getDb();
    const notificationsThread = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId).catch(() => null);
    if (!notificationsThread) throw new Error("Canal de notificaciones no encontrado.");

    const captain = draft.captains.find(c => c.userId === captainId);
    const player = draft.players.find(p => p.userId === playerIdToKick);

    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🚫 Solicitud de Expulsión de Jugador')
        .setDescription(`El capitán **${captain.teamName}** ha solicitado expulsar a **${player.psnId}** de su equipo.`)
        .addFields(
            { name: 'Capitán Solicitante', value: `<@${captainId}>` },
            { name: 'Jugador a Expulsar', value: `<@${playerIdToKick}>` }
        )
        .setFooter({ text: `Draft: ${draft.name}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_approve_kick:${draft.shortId}:${captainId}:${playerIdToKick}`).setLabel('Aprobar Expulsión').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`admin_reject_kick:${draft.shortId}:${captainId}:${playerIdToKick}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
    );

    await notificationsThread.send({ embeds: [embed], components: [row] });
    return { success: true };
}

export async function handleKickApproval(client, draft, captainId, playerIdToKick, wasApproved) {
    const captain = /^\d+$/.test(captainId) ? await client.users.fetch(captainId).catch(() => null) : null;
    const player = /^\d+$/.test(playerIdToKick) ? await client.users.fetch(playerIdToKick).catch(() => null) : null;
    const playerName = draft.players.find(p => p.userId === playerIdToKick)?.psnId || 'el jugador';

    if (wasApproved) {
        await forceKickPlayer(client, draft.shortId, captainId, playerIdToKick);
        if (captain) await captain.send(`✅ Tu solicitud para expulsar a **${playerName}** ha sido **aprobada** por un administrador.`);
        if (player) await player.send(`🚨 Has sido expulsado del equipo en el draft **${draft.name}** tras una solicitud del capitán aprobada por un admin.`);
        return { success: true, message: "Expulsión aprobada y procesada." };
    } else {
        if (captain) await captain.send(`❌ Tu solicitud para expulsar a **${playerName}** ha sido **rechazada** por un administrador.`);
        return { success: true, message: "Expulsión rechazada." };
    }
}

export async function forceKickPlayer(client, draftShortId, teamId, playerIdToKick) {
    const db = getDb();
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) throw new Error('Draft no encontrado.');

    const player = draft.players.find(p => p.userId === playerIdToKick);
    const team = draft.captains.find(c => c.userId === teamId);
    if (!player) throw new Error('Jugador no encontrado en el draft.');
    if (player.captainId !== teamId) throw new Error('El jugador no pertenece a este equipo.');

    if (/^\d+$/.test(playerIdToKick)) {
        try {
            const teamNameFormatted = team.teamName.replace(/\s+/g, '-').toLowerCase();
            const textChannel = guild.channels.cache.find(c => c.name === `💬-${teamNameFormatted}`);
            const voiceChannel = guild.channels.cache.find(c => c.name === `🔊 ${team.teamName}`);
            
            if (textChannel) await textChannel.permissionOverwrites.delete(playerIdToKick, 'Jugador expulsado del equipo');
            if (voiceChannel) await voiceChannel.permissionOverwrites.delete(playerIdToKick, 'Jugador expulsado del equipo');
        } catch (e) {
            console.warn(`No se pudieron revocar los permisos de canal para el jugador expulsado ${playerIdToKick}: ${e.message}`);
        }
    }

    await db.collection('drafts').updateOne(
        { _id: draft._id, "players.userId": playerIdToKick },
        { $set: { "players.$.captainId": null } }
    );

    if (/^\d+$/.test(teamId)) {
        try {
            const captain = await client.users.fetch(teamId);
            await captain.send(`ℹ️ Un administrador ha expulsado a **${player.psnId}** de tu equipo en el draft **${draft.name}**. Ahora es un agente libre.`);
        } catch (e) {
            console.warn(`No se pudo notificar al capitán ${teamId} de la expulsión forzosa.`);
        }
    }

    if (/^\d+$/.test(playerIdToKick)) {
        try {
            const kickedUser = await client.users.fetch(playerIdToKick);
            await kickedUser.send(`🚨 Has sido expulsado del equipo por un administrador en el draft **${draft.name}**. Vuelves a estar en la lista de jugadores disponibles.`);
        } catch (e) {
            console.warn(`No se pudo notificar al jugador expulsado ${playerIdToKick}.`);
        }
    }

    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
}

export async function removeStrike(client, playerId) {
    const db = getDb();
    await db.collection('player_records').updateOne(
        { userId: playerId, strikes: { $gt: 0 } },
        { $inc: { strikes: -1 } }
    );
}

export async function pardonPlayer(client, playerId) {
    const db = getDb();
    await db.collection('player_records').updateOne(
        { userId: playerId },
        { $set: { strikes: 0 } }
    );
}

export async function inviteReplacementPlayer(client, draft, captainId, kickedPlayerId, replacementPlayerId) {
    const player = draft.players.find(p => p.userId === replacementPlayerId);
    if (!player || player.captainId) throw new Error("Este jugador no está disponible o ya tiene equipo.");

    const captain = draft.captains.find(c => c.userId === captainId);
    
    if (/^\d+$/.test(replacementPlayerId)) {
        const replacementUser = await client.users.fetch(replacementPlayerId);
        const embed = new EmbedBuilder()
            .setTitle('🤝 ¡Has recibido una oferta de equipo!')
            .setDescription(`El capitán **${captain.userName}** del equipo **${captain.teamName}** te ha invitado a unirte a su plantilla en el draft **${draft.name}** como reemplazo.`)
            .setColor('#3498db')
            .setFooter({ text: 'Si aceptas, ocuparás una plaza vacante en el equipo.' });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`draft_accept_replacement:${draft.shortId}:${captainId}:${kickedPlayerId}:${replacementPlayerId}`)
                .setLabel('Aceptar Invitación')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`draft_reject_replacement:${draft.shortId}:${captainId}`)
                .setLabel('Rechazar')
                .setStyle(ButtonStyle.Danger)
        );
        
        await replacementUser.send({ embeds: [embed], components: [row] });
    }
}

export async function acceptReplacement(client, guild, draft, captainId, kickedPlayerId, replacementPlayerId) {
    const db = getDb();
    const replacementPlayer = draft.players.find(p => p.userId === replacementPlayerId);
    const captain = draft.captains.find(c => c.userId === captainId);

    // 1. Quitar al jugador antiguo y añadir al nuevo
    await db.collection('tournaments').updateOne(
        { shortId: `draft-${draft.shortId}` },
        { $pull: { [`teams.aprobados.${captainId}.players`]: { userId: kickedPlayerId } } }
    );
    await db.collection('tournaments').updateOne(
        { shortId: `draft-${draft.shortId}` },
        { $push: { [`teams.aprobados.${captainId}.players`]: replacementPlayer } }
    );

    // 2. Otorgar permisos al nuevo y quitarlos al antiguo
    if (/^\d+$/.test(replacementPlayerId) && /^\d+$/.test(kickedPlayerId)) {
        try {
            const teamNameFormatted = captain.teamName.replace(/\s+/g, '-').toLowerCase();
            const textChannel = guild.channels.cache.find(c => c.name === `💬-${teamNameFormatted}`);
            const voiceChannel = guild.channels.cache.find(c => c.name === `🔊 ${captain.teamName}`);

            if (textChannel) {
                await textChannel.permissionOverwrites.delete(kickedPlayerId, 'Reemplazado en el equipo');
                await textChannel.permissionOverwrites.edit(replacementPlayerId, { ViewChannel: true });
            }
            if (voiceChannel) {
                await voiceChannel.permissionOverwrites.delete(kickedPlayerId, 'Reemplazado en el equipo');
                await voiceChannel.permissionOverwrites.edit(replacementPlayerId, { ViewChannel: true });
            }
        } catch(e) {
            console.warn(`Error al gestionar permisos para el reemplazo ${replacementPlayerId}: ${e.message}`);
        }
    }

    // 3. Notificar al capitán
    if (/^\d+$/.test(captainId)) {
        const captainUser = await client.users.fetch(captainId);
        await captainUser.send(`✅ **${replacementPlayer.psnId}** ha aceptado tu invitación y ha reemplazado al jugador anterior en tu equipo.`);
    }
    
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
}
