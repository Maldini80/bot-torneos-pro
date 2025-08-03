// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, ARBITRO_ROLE_ID, TOURNAMENT_CATEGORY_ID, CASTER_ROLE_ID, TEAM_CHANNELS_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed, createTournamentManagementPanel, createTeamListEmbed, createCasterInfoEmbed, createDraftStatusEmbed, createDraftManagementPanel, createDraftMainInterface, createCaptainControlPanel } from '../utils/embeds.js';
import { updateAdminPanel, updateTournamentManagementThread, updateDraftManagementPanel } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { postTournamentUpdate } from '../utils/twitter.js';

// --- INICIO DE LA MODIFICACIÓN ---
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

        // Actualizar mensaje de jugadores
        if (discordMessageIds.mainInterfacePlayerMessageId) {
            const playerMsg = await channel.messages.fetch(discordMessageIds.mainInterfacePlayerMessageId).catch(() => null);
            if (playerMsg) await playerMsg.edit({ embeds: [playersEmbed] });
        }
        
        // Actualizar mensaje de equipos
        if (discordMessageIds.mainInterfaceTeamsMessageId) {
            const teamMsg = await channel.messages.fetch(discordMessageIds.mainInterfaceTeamsMessageId).catch(() => null);
            if (teamMsg) await teamMsg.edit({ embeds: [teamsEmbed] });
        }

        // Actualizar mensaje de orden de turnos
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
// --- FIN DE LA MODIFICACIÓN ---

export async function handlePlayerSelection(client, draftShortId, captainId, selectedPlayerId) {
    const db = getDb();
    await db.collection('drafts').updateOne(
        { shortId: draftShortId, "players.userId": selectedPlayerId },
        { $set: { "players.$.captainId": captainId } }
    );

    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    const player = draft.players.find(p => p.userId === selectedPlayerId);
    const captain = draft.captains.find(c => c.userId === captainId);

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
                
                await guild.channels.create({
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
    try {
        const user = await client.users.fetch(userId);
        await user.send(`💰 ¡Buenas noticias! Tu premio de **${prizeType}** del torneo **${tournament.nombre}** ha sido marcado como **pagado**. ¡Gracias por participar!`);
        return { success: true };
    } catch (e) {
        console.warn(`No se pudo notificar al usuario ${userId} del pago del premio.`);
        return { success: false, error: e };
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
        
        const positionQuotas = { GK: 1, DFC: 2, CARR: 2, MCD: 2, 'MV/MCO': 2, DC: 2 };
        const positionCounts = {};
        Object.keys(positionQuotas).forEach(p => positionCounts[p] = 0);
        const allPlayers = draft.players;
        for (const player of allPlayers) {
            const positions = new Set([player.primaryPosition, player.secondaryPosition]);
            for (const pos of positions) {
                if (positionCounts[pos] !== undefined) {
                    positionCounts[pos]++;
                }
            }
        }
        const missingPositions = [];
        for (const pos in positionQuotas) {
            if (positionCounts[pos] < positionQuotas[pos]) {
                missingPositions.push(`${pos} (faltan ${positionQuotas[pos] - positionCounts[pos]})`);
            }
        }
        if (missingPositions.length > 0) {
            throw new Error(`No se cumplen las cuotas mínimas de jugadores. Faltan: ${missingPositions.join(', ')}.`);
        }

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
            config: { formatId: config.formatId, format, isPaid: config.isPaid, entryFee: config.isPaid ? config.entryFee : 0, prizeCampeon: config.isPaid ? config.prizeCampeon : 0, prizeFinalista: config.isPaid ? config.prizeFinalista : 0, enlacePaypal: config.isPaid ? config.enlacePaypal : null, startTime: config.startTime || null },
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

    } catch (error) { console.error('[CREATE] OCURRIÓ UN ERROR EN MEDIO DEL PROCESO DE CREACIÓN:', error);
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
    
    if (/^\d+$/.test(teamData.capitanId)) {
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

export async function reportPlayer(client, draft, reporterId, reportedPlayerId, reason) {
    const db = getDb();
    const records = db.collection('player_records');
    const notificationsThread = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId).catch(() => null);
    if (!notificationsThread) throw new Error("No se pudo encontrar el canal de notificaciones del draft.");

    const reporter = draft.players.find(p => p.userId === reporterId);
    const reported = draft.players.find(p => p.userId === reportedPlayerId);
    
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
                    reporterId,
                    reporterName: reporter.psnId,
                    reason,
                }
            }
        },
        { returnDocument: 'after', upsert: true }
    );
    
    const newStrikeCount = updateResult.value.strikes;

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('⚠️ Nuevo Strike Reportado')
        .setDescription(`El capitán **${reporter.psnId}** ha reportado a **${reported.psnId}**.`)
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
    const captain = await client.users.fetch(captainId).catch(() => null);
    const player = await client.users.fetch(playerIdToKick).catch(() => null);
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
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) throw new Error('Draft no encontrado.');

    const player = draft.players.find(p => p.userId === playerIdToKick);
    if (!player) throw new Error('Jugador no encontrado en el draft.');
    if (player.captainId !== teamId) throw new Error('El jugador no pertenece a este equipo.');

    await db.collection('drafts').updateOne(
        { _id: draft._id, "players.userId": playerIdToKick },
        { $set: { "players.$.captainId": null } }
    );

    try {
        const captain = await client.users.fetch(teamId);
        await captain.send(`ℹ️ Un administrador ha expulsado a **${player.psnId}** de tu equipo en el draft **${draft.name}**. Ahora es un agente libre.`);
    } catch (e) {
        console.warn(`No se pudo notificar al capitán ${teamId} de la expulsión forzosa.`);
    }

    try {
        const kickedUser = await client.users.fetch(playerIdToKick);
        await kickedUser.send(`🚨 Has sido expulsado del equipo por un administrador en el draft **${draft.name}**. Vuelves a estar en la lista de jugadores disponibles.`);
    } catch (e) {
        console.warn(`No se pudo notificar al jugador expulsado ${playerIdToKick}.`);
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

export async function inviteReplacementPlayer(client, draft, captainId, replacementPlayerId) {
    const player = draft.players.find(p => p.userId === replacementPlayerId);
    if (!player || player.captainId) throw new Error("Este jugador no está disponible.");

    const captain = draft.captains.find(c => c.userId === captainId);
    const replacementUser = await client.users.fetch(replacementPlayerId);

    const embed = new EmbedBuilder()
        .setTitle('🤝 ¡Has recibido una oferta de equipo!')
        .setDescription(`El capitán ${captain.userName} del equipo **${captain.teamName}** te ha invitado a unirte a su plantilla en el draft **${draft.name}** como reemplazo.`)
        .setColor('#3498db');
    
    // NOTA: Para un flujo completo, aquí irían botones de aceptar/rechazar.
    // Por ahora, solo se envía la notificación.
    
    await replacementUser.send({ embeds: [embed] });
}
```

---

### 2. `src/handlers/modalHandler.js` (Completo y Actualizado)

```javascript
// src/handlers/modalHandler.js
import { getDb } from '../../database.js';
import { createNewTournament, updateTournamentConfig, updatePublicMessages, forceResetAllTournaments, addTeamToWaitlist, notifyCastersOfNewTeam, createNewDraft, approveDraftCaptain, updateDraftMainInterface, reportPlayer } from '../logic/tournamentLogic.js';
import { processMatchResult, findMatch, finalizeMatchThread } from '../logic/matchLogic.js';
import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, StringSelectMenuBuilder } from 'discord.js';
import { CHANNELS, ARBITRO_ROLE_ID, PAYMENT_CONFIG, DRAFT_POSITIONS } from '../../config.js';
import { updateTournamentManagementThread, updateDraftManagementPanel } from '../utils/panelManager.js';
import { createDraftStatusEmbed } from '../utils/embeds.js';

export async function handleModal(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    const [action, ...params] = customId.split(':');

    if (action === 'report_player_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId, teamId, playerId] = params;
        const reason = interaction.fields.getTextInputValue('reason_input');
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        try {
            await reportPlayer(client, draft, interaction.user.id, playerId, reason);
            await interaction.editReply({ content: '✅ Tu reporte ha sido enviado y se ha añadido un strike al jugador.' });
        } catch (error) {
            await interaction.editReply({ content: `❌ Error al reportar: ${error.message}` });
        }
        return;
    }

    if (action === 'captain_dm_player_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [playerId] = params;
        const messageContent = interaction.fields.getTextInputValue('message_content');
        
        try {
            const targetUser = await client.users.fetch(playerId);
            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`✉️ Mensaje de ${interaction.user.tag}`)
                .setDescription(messageContent)
                .setTimestamp();
            
            await targetUser.send({ embeds: [embed] });
            await interaction.editReply({ content: `✅ Mensaje enviado a ${targetUser.tag}.` });
        } catch (e) {
            console.error(e);
            await interaction.editReply({ content: '❌ No se pudo enviar el mensaje. Es posible que el usuario tenga los MDs bloqueados.' });
        }
        return;
    }

    if (action === 'create_draft_modal') {
        const name = interaction.fields.getTextInputValue('draft_name_input');

        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId(`create_draft_type:${name}`)
            .setPlaceholder('Paso 2: Selecciona el tipo de draft')
            .addOptions([
                { label: 'Gratuito', value: 'gratis' },
                { label: 'De Pago', value: 'pago' }
            ]);

        await interaction.reply({
            content: `Has nombrado al draft como "${name}". Ahora, selecciona su tipo:`,
            components: [new ActionRowBuilder().addComponents(typeMenu)],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    if (action === 'add_draft_test_players_modal') {
        await interaction.reply({ content: '✅ Orden recibida. Añadiendo participantes de prueba...', flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const amount = parseInt(interaction.fields.getTextInputValue('amount_input'));

        if (isNaN(amount) || amount <= 0) {
            return interaction.followUp({ content: '❌ La cantidad debe ser un número mayor que cero.', flags: [MessageFlags.Ephemeral] });
        }

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) {
            return interaction.followUp({ content: '❌ No se encontró el draft.', flags: [MessageFlags.Ephemeral] });
        }
        
        const amountToAdd = amount;

        const positions = Object.keys(DRAFT_POSITIONS);
        const bulkCaptains = [];
        const bulkPlayers = [];

        for (let i = 0; i < amountToAdd; i++) {
            const uniqueId = `test_${Date.now()}_${i}`;
            const currentCaptainCount = draft.captains.length + bulkCaptains.length;
            const currentPlayerCount = draft.players.length + bulkPlayers.length;

            if (currentCaptainCount < 8) {
                const teamName = `E-Prueba-${currentCaptainCount + 1}`;
                const captainData = {
                    userId: uniqueId, userName: `TestCaptain#${String(i).padStart(4, '0')}`, teamName: teamName,
                    streamChannel: 'https://twitch.tv/test', psnId: `Capi-Prueba-${currentCaptainCount + 1}`, eafcTeamName: `EAFC-Test-${currentCaptainCount + 1}`, twitter: 'test_captain', position: "DC"
                };
                
                const captainAsPlayerData = {
                    userId: uniqueId, userName: captainData.userName, psnId: captainData.psnId, twitter: captainData.twitter,
                    primaryPosition: captainData.position, secondaryPosition: captainData.position, currentTeam: teamName, isCaptain: true, captainId: null
                };
                bulkCaptains.push(captainData);
                bulkPlayers.push(captainAsPlayerData);
            } else {
                const randomPrimaryPos = positions[Math.floor(Math.random() * positions.length)];
                const randomSecondaryPos = positions[Math.floor(Math.random() * positions.length)];
                
                const playerData = {
                    userId: uniqueId, userName: `TestPlayer#${String(i).padStart(4, '0')}`, psnId: `J-Prueba-${currentPlayerCount - draft.captains.length + 1}`,
                    twitter: 'test_player', primaryPosition: randomPrimaryPos, secondaryPosition: randomSecondaryPos, currentTeam: 'Libre', isCaptain: false, captainId: null
                };
                bulkPlayers.push(playerData);
            }
        }

        const updateQuery = {};
        if (bulkCaptains.length > 0) {
            updateQuery.$push = { ...updateQuery.$push, captains: { $each: bulkCaptains } };
        }
        if (bulkPlayers.length > 0) {
            updateQuery.$push = { ...updateQuery.$push, players: { $each: bulkPlayers } };
        }

        if (Object.keys(updateQuery).length > 0) {
            await db.collection('drafts').updateOne({ _id: draft._id }, updateQuery);
        }

        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        await updateDraftMainInterface(client, updatedDraft.shortId);
        await updatePublicMessages(client, updatedDraft);
        await updateDraftManagementPanel(client, updatedDraft);
        
        const nonCaptainPlayersAdded = bulkPlayers.filter(p => !p.isCaptain).length;
        await interaction.editReply({ content: `✅ Se han añadido **${bulkCaptains.length} capitanes** y **${nonCaptainPlayersAdded} jugadores** de prueba.` });
        return;
    }

    if (action === 'create_draft_paid_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [name] = params;
        const entryFee = parseFloat(interaction.fields.getTextInputValue('draft_entry_fee'));
        const prizeCampeon = parseFloat(interaction.fields.getTextInputValue('draft_prize_campeon'));
        const prizeFinalista = parseFloat(interaction.fields.getTextInputValue('draft_prize_finalista'));

        if (isNaN(entryFee) || entryFee <= 0 || isNaN(prizeCampeon) || prizeCampeon < 0 || isNaN(prizeFinalista) || prizeFinalista < 0) {
            return interaction.editReply({ content: '❌ Por favor, introduce números válidos y positivos para los campos monetarios.' });
        }

        const isPaid = true;
        const shortId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const config = { isPaid, entryFee, prizeCampeon, prizeFinalista };

        try {
            await createNewDraft(client, guild, name, shortId, config);
            await interaction.editReply({ content: `✅ ¡Éxito! El draft de pago **"${name}"** ha sido creado.`, components: [] });
        } catch (error) {
            console.error("Error capturado por el handler al crear el draft:", error);
            await interaction.editReply({ content: `❌ Ocurrió un error: ${error.message}`, components: [] });
        }
        return;
    }
    
    if (action === 'register_draft_captain_modal' || action === 'register_draft_player_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const isRegisteringAsCaptain = action.includes('captain');
        let draftShortId, position, primaryPosition, secondaryPosition, teamStatus, streamPlatform;
    
        if (isRegisteringAsCaptain) {
            [draftShortId, position, streamPlatform] = params;
        } else {
            [draftShortId, primaryPosition, secondaryPosition, teamStatus] = params;
        }
    
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        if (!draft) return interaction.editReply('❌ Este draft ya no existe.');
        if (draft.status !== 'inscripcion') return interaction.editReply('❌ Las inscripciones para este draft están cerradas.');

        const userId = interaction.user.id;
        const isAlreadyRegistered = draft.captains.some(c => c.userId === userId) || 
                                  (draft.pendingCaptains && draft.pendingCaptains[userId]) ||
                                  draft.players.some(p => p.userId === userId) || 
                                  (draft.pendingPayments && draft.pendingPayments[userId]);
                                  
        if (isAlreadyRegistered) return interaction.editReply('❌ Ya estás inscrito, pendiente de aprobación o de pago en este draft.');

        let playerData;
        let captainData;
        
        const psnId = interaction.fields.getTextInputValue('psn_id_input');
        const twitter = interaction.fields.getTextInputValue('twitter_input');

        if (isRegisteringAsCaptain) {
            const totalCaptains = draft.captains.length + (draft.pendingCaptains ? Object.keys(draft.pendingCaptains).length : 0);
            if (totalCaptains >= 8) return interaction.editReply('❌ Ya se ha alcanzado el número máximo de solicitudes de capitán.');
            
            const teamName = interaction.fields.getTextInputValue('team_name_input');
            const eafcTeamName = interaction.fields.getTextInputValue('eafc_team_name_input');
            const streamUsername = interaction.fields.getTextInputValue('stream_username_input');
            const streamChannel = streamPlatform === 'twitch' ? `https://twitch.tv/${streamUsername}` : `https://youtube.com/@${streamUsername}`;
            
            if (draft.captains.some(c => c.teamName.toLowerCase() === teamName.toLowerCase())) return interaction.editReply('❌ Ya existe un equipo con ese nombre.');

            captainData = { userId, userName: interaction.user.tag, teamName, eafcTeamName, streamChannel, psnId, twitter, position };
            playerData = { userId, userName: interaction.user.tag, psnId, twitter, primaryPosition: position, secondaryPosition: position, currentTeam: teamName, isCaptain: true, captainId: null };
        } else {
            let currentTeam;
            if (teamStatus === 'Con Equipo') {
                currentTeam = interaction.fields.getTextInputValue('current_team_input');
            } else {
                currentTeam = 'Libre';
            }
            playerData = { userId, userName: interaction.user.tag, psnId, twitter, primaryPosition, secondaryPosition, currentTeam, isCaptain: false, captainId: null };
        }

        if (draft.config.isPaid) {
            const pendingData = { playerData, captainData }; 
            await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { [`pendingPayments.${userId}`]: pendingData } });

            const embedDm = new EmbedBuilder().setTitle(`💸 Inscripción al Draft Pendiente de Pago: ${draft.name}`).setDescription(`Para confirmar tu plaza, realiza el pago de **${draft.config.entryFee}€**.\n\n**Pagar a / Pay to:** \`${PAYMENT_CONFIG.PAYPAL_EMAIL}\`\n\nUna vez realizado, pulsa el botón de abajo.`).setColor('#e67e22');
            const confirmButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`draft_payment_confirm_start:${draftShortId}`).setLabel('✅ Ya he Pagado / I Have Paid').setStyle(ButtonStyle.Success));
            try {
                await interaction.user.send({ embeds: [embedDm], components: [confirmButton] });
                await interaction.editReply('✅ ¡Inscripción recibida! Revisa tus Mensajes Directos para completar el pago.');
            } catch (e) {
                await interaction.editReply('❌ No he podido enviarte un MD. Por favor, abre tus MDs y vuelve a intentarlo.');
            }
        } else {
            if (isRegisteringAsCaptain) {
                await db.collection('drafts').updateOne(
                    { _id: draft._id },
                    { $set: { [`pendingCaptains.${userId}`]: captainData } }
                );

                const approvalChannel = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId);
                const adminEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(`🔔 Nueva Solicitud de Capitán de Draft`)
                    .setDescription(`**Draft:** ${draft.name}`)
                    .addFields( 
                        { name: 'Nombre de Equipo', value: captainData.teamName, inline: true }, 
                        { name: 'Capitán', value: interaction.user.tag, inline: true },
                        { name: 'PSN ID', value: captainData.psnId, inline: false },
                        { name: 'Equipo EAFC', value: captainData.eafcTeamName, inline: false },
                        { name: 'Canal Transmisión', value: captainData.streamChannel, inline: false },
                        { name: 'Twitter', value: captainData.twitter || 'No proporcionado', inline: false }
                    );
                const adminButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`draft_approve_captain:${draftShortId}:${userId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`draft_reject_captain:${draftShortId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
                );
                
                await approvalChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
                await interaction.editReply('✅ ¡Tu solicitud para ser capitán ha sido recibida! Un administrador la revisará pronto.');

            } else {
                await db.collection('drafts').updateOne({ _id: draft._id }, { $push: { players: playerData } });
                await interaction.editReply(`✅ ¡Te has inscrito como jugador!`);
                
                const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
                await updateDraftMainInterface(client, updatedDraft.shortId);
                await updatePublicMessages(client, updatedDraft);
            }
        }
        return;
    }
    
    if(action === 'draft_payment_confirm_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) return interaction.editReply('❌ Este draft ya no existe.');
        
        const notificationsChannel = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId).catch(() => null);
        if (!notificationsChannel) return interaction.editReply('Error interno: No se pudo encontrar el canal de notificaciones.');
        
        const userPaypal = interaction.fields.getTextInputValue('user_paypal_input');
        const userId = interaction.user.id;
        const pendingData = draft.pendingPayments[userId];

        if (!pendingData) return interaction.editReply('❌ No se encontró tu inscripción pendiente. Por favor, inscríbete de nuevo.');

        const role = pendingData.captainData ? 'Capitán' : 'Jugador';
        const teamName = pendingData.captainData ? ` (Equipo: ${pendingData.captainData.teamName})` : '';

        const adminEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle(`💰 Notificación de Pago de Draft: ${draft.name}`).addFields( 
            { name: 'Jugador', value: interaction.user.tag, inline: true },
            { name: 'Rol', value: role + teamName, inline: true },
            { name: "PayPal del Jugador", value: `\`${userPaypal}\`` } 
        );
        const adminButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`draft_approve_payment:${draftShortId}:${userId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`draft_reject_payment:${draftShortId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );
        
        await notificationsChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
        await interaction.editReply('✅ ¡Gracias! Tu pago ha sido notificado. Recibirás un aviso cuando sea aprobado.');
        return;
    }

    if (action === 'admin_force_reset_modal') {
        const confirmation = interaction.fields.getTextInputValue('confirmation_text');
        if (confirmation !== 'CONFIRMAR RESET') {
            return interaction.reply({ content: '❌ El texto de confirmación no coincide. El reseteo ha sido cancelado.', flags: [MessageFlags.Ephemeral] });
        }
        await interaction.reply({ content: '⏳ **CONFIRMADO.** Iniciando reseteo forzoso...', flags: [MessageFlags.Ephemeral] });
        try {
            await forceResetAllTournaments(client);
            await interaction.followUp({ content: '✅ **RESETEO COMPLETO.**', flags: [MessageFlags.Ephemeral] });
        } catch (error) {
            console.error("Error crítico durante el reseteo forzoso:", error);
            await interaction.followUp({ content: '❌ Ocurrió un error crítico durante el reseteo. Revisa los logs.', flags: [MessageFlags.Ephemeral] });
        }
        return;
    }
    if (action === 'create_tournament') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [formatId, type] = params;
        const nombre = interaction.fields.getTextInputValue('torneo_nombre');
        const shortId = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const config = { formatId, isPaid: type === 'pago' };
        config.startTime = interaction.fields.getTextInputValue('torneo_start_time') || null;
        if (config.isPaid) {
            config.entryFee = parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee'));
            config.enlacePaypal = PAYMENT_CONFIG.PAYPAL_EMAIL;
            config.prizeCampeon = parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon'));
            config.prizeFinalista = parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista') || '0');
        }
        try {
            await createNewTournament(client, guild, nombre, shortId, config);
            await interaction.editReply({ content: `✅ ¡Éxito! El torneo **"${nombre}"** ha sido creado.` });
        } catch (error) {
            console.error("Error capturado por el handler al crear el torneo:", error);
            await interaction.editReply({ content: `❌ Ocurrió un error al crear el torneo. Revisa los logs.` });
        }
        return;
    }
    if (action === 'edit_tournament_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const newConfig = {
            prizeCampeon: parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon')),
            prizeFinalista: parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista')),
            entryFee: parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee')),
            startTime: interaction.fields.getTextInputValue('torneo_start_time') || null,
        };
        newConfig.isPaid = newConfig.entryFee > 0;
        try {
            await updateTournamentConfig(client, tournamentShortId, newConfig);
            await interaction.editReply({ content: '✅ ¡Éxito! La configuración ha sido actualizada. Usa el botón "Notificar Cambios" para avisar a los capitanes.' });
        } catch (error) {
            console.error("Error al actualizar la configuración del torneo:", error);
            await interaction.editReply({ content: `❌ Ocurrió un error al actualizar el torneo. Revisa los logs.` });
        }
        return;
    }
    if (action === 'edit_payment_details_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const newConfig = {
            isPaid: true,
            entryFee: parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee')),
            prizeCampeon: parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon')),
            prizeFinalista: parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista')),
        };
        await updateTournamentConfig(client, tournamentShortId, newConfig);
        await interaction.editReply({ content: `✅ Torneo actualizado a: **De Pago**.`, components: [] });
        return;
    }
    if (action === 'inscripcion_modal' || action === 'reserva_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, streamPlatform] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    
        if (!tournament || tournament.status !== 'inscripcion_abierta') {
            return interaction.editReply('Las inscripciones para este torneo no están abiertas.');
        }
    
        const captainId = interaction.user.id;
        const isAlreadyInTournament = tournament.teams.aprobados[captainId] || tournament.teams.pendientes[captainId] || (tournament.teams.reserva && tournament.teams.reserva[captainId]);
        if (isAlreadyInTournament) {
            return interaction.editReply({ content: '❌ 🇪🇸 Ya estás inscrito o en la lista de reserva de este torneo.\n🇬🇧 You are already registered or on the waitlist for this tournament.'});
        }
        
        const teamName = interaction.fields.getTextInputValue('nombre_equipo_input');
        const eafcTeamName = interaction.fields.getTextInputValue('eafc_team_name_input');
        const twitter = interaction.fields.getTextInputValue('twitter_input');
        const streamUsername = interaction.fields.getTextInputValue('stream_username_input');
        const streamChannel = streamPlatform === 'twitch' ? `https://twitch.tv/${streamUsername}` : `https://youtube.com/@${streamUsername}`;
    
        const allTeamNames = [
            ...Object.values(tournament.teams.aprobados || {}).map(e => e.nombre.toLowerCase()),
            ...Object.values(tournament.teams.pendientes || {}).map(e => e.nombre.toLowerCase()),
            ...Object.values(tournament.teams.reserva || {}).map(e => e.nombre.toLowerCase())
        ];
    
        if (allTeamNames.includes(teamName.toLowerCase())) {
            return interaction.editReply('Ya existe un equipo con este nombre en este torneo.');
        }
        
        const teamData = { 
            id: captainId, 
            nombre: teamName, 
            eafcTeamName, 
            capitanId: captainId, 
            capitanTag: interaction.user.tag, 
            coCaptainId: null, 
            coCaptainTag: null, 
            bandera: '🏳️', 
            paypal: null, 
            streamChannel, 
            twitter, 
            inscritoEn: new Date() 
        };
    
        if (action === 'reserva_modal') {
            await addTeamToWaitlist(client, tournament, teamData);
            await interaction.editReply('✅ 🇪🇸 ¡Inscripción recibida! Has sido añadido a la **lista de reserva**. Serás notificado si una plaza queda libre.\n🇬🇧 Registration received! You have been added to the **waitlist**. You will be notified if a spot becomes available.');
            return;
        }
    
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { [`teams.pendientes.${captainId}`]: teamData } });
        
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (!notificationsThread) {
            return interaction.editReply('Error interno: No se pudo encontrar el canal de notificaciones.');
        }
    
        if (tournament.config.isPaid) {
            const embedDm = new EmbedBuilder().setTitle(`💸 Inscripción Pendiente de Pago: ${tournament.nombre}`).setDescription(`🇪🇸 ¡Casi listo! Para confirmar tu plaza, realiza el pago.\n🇬🇧 Almost there! To confirm your spot, please complete the payment.`).addFields({ name: 'Entry', value: `${tournament.config.entryFee}€` }, { name: 'Pagar a / Pay to', value: `\`${tournament.config.enlacePaypal}\`` }, { name: 'Instrucciones / Instructions', value: '🇪🇸 1. Realiza el pago.\n2. Pulsa el botón de abajo para confirmar.\n\n🇬🇧 1. Make the payment.\n2. Press the button below to confirm.' }).setColor('#e67e22');
            const confirmButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`payment_confirm_start:${tournament.shortId}`).setLabel('✅ He Pagado / I Have Paid').setStyle(ButtonStyle.Success));
            try {
                await interaction.user.send({ embeds: [embedDm], components: [confirmButton] });
                await interaction.editReply({ content: '✅ 🇪🇸 ¡Inscripción recibida! Revisa tus MD para completar el pago.\n🇬🇧 Registration received! Check your DMs to complete the payment.' });
            } catch (e) {
                await interaction.editReply({ content: '❌ 🇪🇸 No he podido enviarte un MD. Por favor, abre tus MDs y vuelve a intentarlo.\n🇬🇧 I could not send you a DM. Please open your DMs and try again.' });
            }
        } else {
            const adminEmbed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`🔔 Nueva Inscripción Gratuita`)
                .addFields( 
                    { name: 'Equipo Torneo', value: teamName, inline: true }, 
                    { name: 'Capitán', value: interaction.user.tag, inline: true }, 
                    { name: 'Equipo EAFC', value: eafcTeamName, inline: false },
                    { name: 'Canal Transmisión', value: streamChannel, inline: false },
                    { name: 'Twitter', value: twitter || 'No proporcionado', inline: false }
                );
            const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_approve:${interaction.user.id}:${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin_reject:${interaction.user.id}:${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
            await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });
            await interaction.editReply('✅ 🇪🇸 ¡Tu inscripción ha sido recibida! Un admin la revisará pronto.\n🇬🇧 Your registration has been received! An admin will review it shortly.');
        }
        return;
    }
    if (action === 'payment_confirm_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('❌ Este torneo ya no existe.');
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (!notificationsThread) return interaction.editReply('Error interno: No se pudo encontrar el canal de notificaciones.');
        const userPaypal = interaction.fields.getTextInputValue('user_paypal_input');
        await db.collection('tournaments').updateOne({ shortId: tournamentShortId }, { $set: { [`teams.pendientes.${interaction.user.id}.paypal`]: userPaypal } });
        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const teamData = updatedTournament.teams.pendientes[interaction.user.id];
        if (!teamData) return interaction.editReply('❌ No se encontró tu inscripción pendiente. Por favor, inscríbete de nuevo.');
        const adminEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle(`💰 Notificación de Pago`).addFields( { name: 'Equipo', value: teamData.nombre, inline: true }, { name: 'Capitán', value: teamData.capitanTag, inline: true }, { name: "PayPal del Capitán", value: `\`${userPaypal}\`` } );
        const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_approve:${interaction.user.id}:${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin_reject:${interaction.user.id}:${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });
        await interaction.editReply('✅ 🇪🇸 ¡Gracias! Tu pago ha sido notificado. Recibirás un aviso cuando sea aprobado.\n🇬🇧 Thank you! Your payment has been notified. You will receive a notice upon approval.');
        return;
    }
    if (action === 'add_test_teams_modal') {
        await interaction.reply({ content: '✅ Orden recibida. Añadiendo equipos de prueba en segundo plano...', flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const amount = parseInt(interaction.fields.getTextInputValue('amount_input'));
        if (isNaN(amount) || amount <= 0) return;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return;
        const teamsCount = Object.keys(tournament.teams.aprobados).length;
        const availableSlots = tournament.config.format.size - teamsCount;
        const amountToAdd = Math.min(amount, availableSlots);
        if (amountToAdd <= 0) return;
        let bulkOps = [];
        for (let i = 0; i < amountToAdd; i++) {
            const teamId = `test_${Date.now()}_${i}`;
            const teamData = { id: teamId, nombre: `E-Prueba-${teamsCount + i + 1}`, eafcTeamName: `EAFC-Test-${teamsCount + i + 1}`, capitanId: teamId, capitanTag: `TestUser#${1000 + i}`, bandera: '🧪', paypal: 'admin@test.com', streamChannel: 'https://twitch.tv/test', twitter: 'test', inscritoEn: new Date() };
            bulkOps.push({ updateOne: { filter: { _id: tournament._id }, update: { $set: { [`teams.aprobados.${teamId}`]: teamData } } } });
        }
        if (bulkOps.length > 0) await db.collection('tournaments').bulkWrite(bulkOps);
        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        await updatePublicMessages(client, updatedTournament);
        await updateTournamentManagementThread(client, updatedTournament);
        return;
    }
    if (action === 'report_result_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [matchId, tournamentShortId] = params;
        let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const { partido } = findMatch(tournament, matchId);
        if (!partido) return interaction.editReply('Error: Partido no encontrado.');
        const golesA = interaction.fields.getTextInputValue('goles_a');
        const golesB = interaction.fields.getTextInputValue('goles_b');
        if (isNaN(parseInt(golesA)) || isNaN(parseInt(golesB))) return interaction.editReply('Error: Los goles deben ser números.');
        const reportedResult = `${golesA}-${golesB}`;
        const reporterId = interaction.user.id;
        const opponentId = reporterId === partido.equipoA.capitanId ? partido.equipoB.capitanId : partido.equipoA.capitanId;
        partido.reportedScores[reporterId] = reportedResult;
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { "structure": tournament.structure } });
        const opponentReport = partido.reportedScores[opponentId];
        if (opponentReport) {
            if (opponentReport === reportedResult) {
                tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
                const processedMatch = await processMatchResult(client, guild, tournament, matchId, reportedResult);
                await interaction.editReply({content: '✅ 🇪🇸 Resultados coinciden. El partido ha sido finalizado.\n🇬🇧 Results match. The match has been finalized.'});
                await finalizeMatchThread(client, processedMatch, reportedResult);
            } else {
                await interaction.editReply({content: '❌ 🇪🇸 Los resultados reportados no coinciden. Se ha notificado a los árbitros.\n🇬🇧 The reported results do not match. Referees have been notified.'});
                const thread = interaction.channel;
                if(thread.isThread()) await thread.setName(`⚠️${thread.name.replace(/^[⚔️✅🔵]-/g, '')}`.slice(0,100));
                await interaction.channel.send({ content: `🚨 <@&${ARBITRO_ROLE_ID}> ¡Resultados no coinciden para el partido **${partido.equipoA.nombre} vs ${partido.equipoB.nombre}**!\n- <@${reporterId}> reportó: \`${reportedResult}\`\n- <@${opponentId}> reportó: \`${opponentReport}\`` });
            }
        } else {
            await interaction.editReply({content: '✅ 🇪🇸 Tu resultado ha sido enviado. Esperando el reporte de tu oponente.\n🇬🇧 Your result has been submitted. Awaiting your opponent\'s report.'});
            await interaction.channel.send(`ℹ️ <@${reporterId}> ha reportado un resultado de **${reportedResult}**. Esperando la confirmación de <@${opponentId}>.`);
        }
        return;
    }
    if (action === 'admin_force_result_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [matchId, tournamentShortId] = params;
        let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');
        const golesA = interaction.fields.getTextInputValue('goles_a');
        const golesB = interaction.fields.getTextInputValue('goles_b');
        if (isNaN(parseInt(golesA)) || isNaN(parseInt(golesB))) return interaction.editReply('Error: Los goles deben ser números.');
        const resultString = `${golesA}-${golesB}`;
        
        const processedMatch = await processMatchResult(client, guild, tournament, matchId, resultString);
        await interaction.editReply(`✅ Resultado forzado a **${resultString}** por un administrador.`);
        await finalizeMatchThread(client, processedMatch, resultString);

        return;
    }
    if (action === 'invite_cocaptain_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        const captainId = interaction.user.id;
        const team = tournament.teams.aprobados[captainId];
        if (!team) return interaction.editReply({ content: 'Error: No eres el capitán de un equipo en este torneo.' });
        if (team.coCaptainId) return interaction.editReply({ content: 'Ya tienes un co-capitán.'});
        
        const coCaptainId = interaction.fields.getTextInputValue('cocaptain_id_input').trim();
        
        if (!/^\d+$/.test(coCaptainId)) {
            return interaction.editReply({ 
                content: '❌ **Error:** El valor introducido no es una ID de Discord válida. Por favor, introduce únicamente la ID numérica del usuario (ej: 1398287366929776670).',
                flags: [MessageFlags.Ephemeral]
            });
        }
        
        const allCaptainsAndCoCaptains = Object.values(tournament.teams.aprobados).flatMap(t => [t.capitanId, t.coCaptainId]).filter(Boolean);
        if (allCaptainsAndCoCaptains.includes(coCaptainId)) {
            return interaction.editReply({ content: '❌ Esta persona ya participa en el torneo como capitán o co-capitán.' });
        }

        try {
            const coCaptainUser = await client.users.fetch(coCaptainId);
            if (coCaptainUser.bot) return interaction.editReply({ content: 'No puedes invitar a un bot.' });
            
            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.coCapitanes.${captainId}`]: { inviterId: captainId, invitedId: coCaptainId, invitedAt: new Date() } } }
            );

            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`🤝 Invitación de Co-Capitán / Co-Captain Invitation`)
                .setDescription(`🇪🇸 Has sido invitado por **${interaction.user.tag}** para ser co-capitán de su equipo **${team.nombre}** en el torneo **${tournament.nombre}**.\n\n` +
                              `🇬🇧 You have been invited by **${interaction.user.tag}** to be the co-captain of their team **${team.nombre}** in the **${tournament.nombre}** tournament.`);
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`cocaptain_accept:${tournament.shortId}:${captainId}:${coCaptainId}`).setLabel('Aceptar / Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`cocaptain_reject:${tournament.shortId}:${captainId}:${coCaptainId}`).setLabel('Rechazar / Reject').setStyle(ButtonStyle.Danger)
            );

            await coCaptainUser.send({ embeds: [embed], components: [row] });
            await interaction.followUp({ content: `✅ Invitación enviada a **${coCaptainUser.tag}**. Recibirá un MD para aceptar o rechazar.`, flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            console.error(error);
            if (error.code === 10013) {
                await interaction.editReply('❌ No se pudo encontrar a ese usuario. Asegúrate de que la ID es correcta.');
            } else {
                 await interaction.editReply('❌ No se pudo enviar el MD de invitación. Es posible que el usuario tenga los mensajes directos bloqueados.');
            }
        }
    }
}

