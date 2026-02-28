// src/logic/tournamentLogic.js
import { checkVerification } from './verificationLogic.js';
import { getDb, getBotSettings } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, ARBITRO_ROLE_ID, TOURNAMENT_CATEGORY_ID, CASTER_ROLE_ID, TEAM_CHANNELS_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed, createTournamentManagementPanel, createTeamListEmbed, createCasterInfoEmbed, createDraftStatusEmbed, createDraftManagementPanel, createDraftMainInterface, createCaptainControlPanel } from '../utils/embeds.js';
import { updateAdminPanel, updateTournamentManagementThread, updateDraftManagementPanel } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { postTournamentUpdate } from '../utils/twitter.js';
import { visualizerStateHandler } from '../../visualizerServer.js';
import { parsePlayerList } from '../utils/textParser.js';


// Midfielder constants removed

export async function notifyVisualizer(draft) {
    // Enriquece los datos del draft con los strikes persistentes
    const db = getDb();
    const playerIds = draft.players.map(p => p.userId);
    const records = await db.collection('player_records').find({ userId: { $in: playerIds } }).toArray();
    const strikesMap = new Map(records.map(r => [r.userId, r.strikes]));

    const enrichedDraft = JSON.parse(JSON.stringify(draft)); // Copia profunda
    for (const player of enrichedDraft.players) {
        player.strikes = strikesMap.get(player.userId) || 0;
    }

    visualizerStateHandler.updateDraft(enrichedDraft);
}

export async function notifyTournamentVisualizer(tournament) {
    visualizerStateHandler.updateTournament(tournament);
}

async function publishDraftVisualizerURL(client, draft) {
    if (!process.env.BASE_URL) return;

    try {
        const visualizerLink = `${process.env.BASE_URL}/?draftId=${draft.shortId}`;

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🔴 Visualizador del Draft EN VIVO')
            .setDescription(`¡El visualizador para el draft **${draft.name}** ya está disponible!\n\nUtiliza el botón de abajo para abrirlo en tu navegador. Esta es la URL que debes capturar en tu software de streaming (OBS, Streamlabs, etc.).`)
            .setImage('https://i.imgur.com/959tU0e.png')
            .setTimestamp()
            .setFooter({ text: 'VPG Lightnings - Sistema de Drafts' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Abrir Visualizador del Draft')
                .setStyle(ButtonStyle.Link)
                .setURL(visualizerLink)
                .setEmoji('🔗')
        );

        if (draft.discordMessageIds.casterTextChannelId) {
            const casterChannel = await client.channels.fetch(draft.discordMessageIds.casterTextChannelId);
            const casterRole = await casterChannel.guild.roles.fetch(CASTER_ROLE_ID).catch(() => null);
            await casterChannel.send({
                content: casterRole ? `<@&${casterRole.id}>` : '',
                embeds: [embed],
                components: [row]
            });
        }

        if (draft.discordChannelId) {
            const publicInfoChannel = await client.channels.fetch(draft.discordChannelId);
            await publicInfoChannel.send({
                embeds: [embed],
                components: [row]
            });
        }

    } catch (e) {
        console.error(`[Visualizer] Fallo al publicar URL de draft para ${draft.shortId}:`, e);
    }
}

async function publishTournamentVisualizerURL(client, tournament) {
    if (!process.env.BASE_URL) return;
    try {
        const visualizerLink = `${process.env.BASE_URL}/?tournamentId=${tournament.shortId}`;

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🏆 Visualizador del Torneo EN VIVO')
            .setDescription(`¡El visualizador para el torneo **${tournament.nombre}** ya está disponible!\n\nUtiliza el botón de abajo para abrirlo y seguir toda la acción en tiempo real.`)
            .setImage('https://i.imgur.com/959tU0e.png')
            .setTimestamp()
            .setFooter({ text: 'VPG Lightnings - Sistema de Torneos' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Abrir Visualizador del Torneo')
                .setStyle(ButtonStyle.Link)
                .setURL(visualizerLink)
                .setEmoji('🔗')
        );

        if (tournament.discordMessageIds.casterThreadId) {
            const casterThread = await client.channels.fetch(tournament.discordMessageIds.casterThreadId);
            const casterRole = await casterThread.guild.roles.fetch(CASTER_ROLE_ID).catch(() => null);
            await casterThread.send({
                content: casterRole ? `<@&${casterRole.id}>` : '',
                embeds: [embed],
                components: [row]
            });
        }

        if (tournament.discordChannelIds.infoChannelId) {
            const publicInfoChannel = await client.channels.fetch(tournament.discordChannelIds.infoChannelId);
            await publicInfoChannel.send({
                embeds: [embed],
                components: [row]
            });
        }

    } catch (e) {
        console.error(`[Visualizer] Fallo al publicar URL de torneo para ${tournament.shortId}:`, e);
    }
}

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

        const [playersEmbeds, teamsEmbed, turnOrderEmbed] = createDraftMainInterface(draft);

        if (discordMessageIds.mainInterfacePlayerMessageId) {
            const playerMsg = await channel.messages.fetch(discordMessageIds.mainInterfacePlayerMessageId).catch(() => null);
            if (playerMsg) {
                // FIX: Truncar embeds para no superar el límite de 6000 caracteres de Discord
                let totalSize = 0;
                const safeEmbeds = [];
                for (const embed of playersEmbeds) {
                    const embedJson = embed.toJSON ? embed.toJSON() : embed;
                    const embedSize = JSON.stringify(embedJson).length;
                    if (totalSize + embedSize > 5800) {
                        // Añadir un embed final indicando que la lista está truncada
                        safeEmbeds.push(new EmbedBuilder().setColor('#e67e22').setDescription('⚠️ **Lista truncada.** Consulta la web del draft para ver todos los jugadores disponibles.'));
                        break;
                    }
                    safeEmbeds.push(embed);
                    totalSize += embedSize;
                }
                await playerMsg.edit({ embeds: safeEmbeds });
            }
        }

        if (discordMessageIds.mainInterfaceTeamsMessageId) {
            const teamMsg = await channel.messages.fetch(discordMessageIds.mainInterfaceTeamsMessageId).catch(() => null);
            if (teamMsg) {
                const teamsEmbedJson = teamsEmbed.toJSON ? teamsEmbed.toJSON() : teamsEmbed;
                const teamsSize = JSON.stringify(teamsEmbedJson).length;
                if (teamsSize > 5800) {
                    const truncatedTeamsEmbed = new EmbedBuilder()
                        .setColor('#2ecc71')
                        .setTitle('Equipos del Draft')
                        .setDescription('⚠️ **Lista de equipos demasiado larga para Discord.** Consulta la web del draft para ver las plantillas completas.');
                    await teamMsg.edit({ embeds: [truncatedTeamsEmbed] });
                } else {
                    await teamMsg.edit({ embeds: [teamsEmbed] });
                }
            }
        }

        if (discordMessageIds.turnOrderMessageId) {
            const turnMsg = await channel.messages.fetch(discordMessageIds.turnOrderMessageId).catch(() => null);
            if (turnMsg) await turnMsg.edit({ embeds: [turnOrderEmbed] });
        }

    } catch (error) {
        if (error.code !== 10003 && error.code !== 10008) {
            console.error(`[Interface Update] Error al actualizar la interfaz principal para el draft ${draftShortId}:`, error);
        }
    }
}

export async function handlePlayerSelection(client, draftShortId, captainId, selectedPlayerId, pickedForPosition) {
    try {
        const db = getDb();
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const player = draft.players.find(p => p.userId === selectedPlayerId);
        const captain = draft.captains.find(c => c.userId === captainId);

        const settings = await getBotSettings();
        const maxQuotas = Object.fromEntries(
            settings.draftMaxQuotas.split(',').map(q => q.split(':'))
        );
        const teamPlayers = draft.players.filter(p => p.captainId === captainId);

        const positionToCheck = pickedForPosition;

        if (maxQuotas[positionToCheck]) {
            const max = parseInt(maxQuotas[positionToCheck]);
            const currentCount = teamPlayers.filter(p => p.primaryPosition === positionToCheck).length;
            if (currentCount >= max) {
                throw new Error(`Ya has alcanzado el máximo de ${max} jugadores para la posición ${positionToCheck}.`);
            }
        }

        await db.collection('drafts').updateOne(
            { shortId: draftShortId, "players.userId": selectedPlayerId },
            { $set: { "players.$.captainId": captainId, "players.$.pickedForPosition": pickedForPosition } }
        );

        const lastPickInfo = {
            pickNumber: draft.selection.currentPick,
            playerPsnId: player.psnId,
            captainTeamName: captain.teamName,
            captainId: captainId,
            playerId: selectedPlayerId,
            position: pickedForPosition
        };
        await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { "selection.lastPick": lastPickInfo } });

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
    } catch (error) {
        console.error(`[PICK DISCORD] Fallo en el pick del capitán ${captainId}: ${error.message}`);
        throw error;
    }
}

export async function adminAddPlayerToDraft(client, draft, playerObj) {
    const db = getDb();

    // Validar que el jugador no esté ya inscrito
    const isAlreadyRegistered = draft.players.some(p => p.userId === playerObj.userId || p.psnId.toLowerCase() === playerObj.psnId.toLowerCase());
    if (isAlreadyRegistered) {
        return { success: false, message: 'El jugador ya está inscrito en este draft (por Discord ID o PSN ID).' };
    }

    try {
        await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $push: { players: playerObj } }
        );

        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        await updatePublicMessages(client, updatedDraft);
        await updateDraftMainInterface(client, updatedDraft.shortId);
        await notifyVisualizer(updatedDraft);

        return { success: true };
    } catch (error) {
        console.error("Error en adminAddPlayerToDraft:", error);
        return { success: false, message: 'Fallo al guardar en base de datos.' };
    }
}

export async function handlePlayerSelectionFromWeb(client, draftShortId, captainId, selectedPlayerId, pickedForPosition) {
    const db = getDb();

    try {
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        const currentCaptainTurnId = draft.selection.order[draft.selection.turn];
        if (currentCaptainTurnId !== captainId) {
            throw new Error('No es el turno de este capitán.');
        }

        const player = draft.players.find(p => p.userId === selectedPlayerId);
        const captain = draft.captains.find(c => c.userId === captainId);

        const settings = await getBotSettings();
        const maxQuotas = Object.fromEntries(
            settings.draftMaxQuotas.split(',').map(q => q.split(':'))
        );
        const teamPlayers = draft.players.filter(p => p.captainId === captainId);

        const positionToCheck = pickedForPosition;

        if (maxQuotas[positionToCheck]) {
            const max = parseInt(maxQuotas[positionToCheck]);
            const currentCount = teamPlayers.filter(p => p.primaryPosition === positionToCheck).length;
            if (currentCount >= max) {
                throw new Error(`Ya has alcanzado el máximo de ${max} jugadores para la posición ${positionToCheck}.`);
            }
        }

        await db.collection('drafts').updateOne(
            { shortId: draftShortId, "players.userId": selectedPlayerId },
            { $set: { "players.$.captainId": captainId, "players.$.pickedForPosition": pickedForPosition } }
        );

        const lastPickInfo = { pickNumber: draft.selection.currentPick, playerPsnId: player.psnId, captainTeamName: captain.teamName, captainId: captainId, playerId: selectedPlayerId, position: pickedForPosition };
        await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { "selection.lastPick": lastPickInfo } });

        if (/^\d+$/.test(selectedPlayerId)) {
            try {
                const playerUser = await client.users.fetch(selectedPlayerId);
                const embed = new EmbedBuilder().setColor('#2ecc71').setTitle(`¡Has sido seleccionado en el Draft!`).setDescription(`¡Enhorabuena! Has sido elegido por el equipo **${captain.teamName}** (Capitán: ${captain.userName}) en el draft **${draft.name}**.`);
                await playerUser.send({ embeds: [embed] });
            } catch (e) { console.warn(`No se pudo notificar al jugador seleccionado ${selectedPlayerId}`); }
        }

        try {
            const draftChannel = await client.channels.fetch(draft.discordChannelId);
            const announcementEmbed = new EmbedBuilder().setColor('#3498db').setDescription(`**Pick #${draft.selection.currentPick}**: El equipo **${captain.teamName}** ha seleccionado a **${player.psnId}**`);
            const announcementMessage = await draftChannel.send({ embeds: [announcementEmbed] });
            setTimeout(() => announcementMessage.delete().catch(() => { }), 60000);
        } catch (e) { console.error("No se pudo enviar el anuncio de pick:", e); }

    } catch (error) {
        console.error(`[PICK WEB] Fallo en el pick del capitán ${captainId}: ${error.message}`);
        visualizerStateHandler.sendToUser(captainId, { type: 'pick_error', message: error.message });
        throw error;
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
        whatsapp: captainData.whatsapp,
        primaryPosition: captainData.position,
        secondaryPosition: 'NONE',
        currentTeam: captainData.teamName,
        isCaptain: true,
        captainId: captainData.userId
    };

    // --- FIX: Si ya existía como jugador (por userId O por psnId de una importación manual), eliminarlo primero ---
    const existingPlayer = draft.players.find(p =>
        p.userId === captainData.userId ||
        (p.psnId.toLowerCase() === captainData.psnId.toLowerCase() && !p.isCaptain)
    );
    if (existingPlayer) {
        await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $pull: { players: { userId: existingPlayer.userId } } }
        );
        console.log(`[DRAFT] Entrada fantasma/manual "${existingPlayer.psnId}" (${existingPlayer.userId}) eliminada al aprobar como capitán a ${captainData.userId}`);
    }

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

            const loginUrl = `${process.env.BASE_URL}/login?returnTo=${encodeURIComponent(`/?draftId=${draft.shortId}`)}`;
            const loginButtonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Iniciar Sesión en el Visualizador Web')
                    .setStyle(ButtonStyle.Link)
                    .setURL(loginUrl)
                    .setEmoji('🌐')
            );

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle(`👑 ¡Felicidades, Capitán! Has sido aprobado para el Draft "${draft.name}"`)
                .setDescription(
                    `¡Bienvenido a bordo! Eres oficialmente el capitán del equipo **"${captainData.teamName}"**. Aquí tienes tu guía de referencia:`
                )
                .addFields(
                    {
                        name: "1️⃣ Tu Panel de Control Web (¡MUY IMPORTANTE!)",
                        value: "Para poder fichar jugadores desde la web (incluso desde el móvil), **debes iniciar sesión una vez** usando tu enlace personal a continuación. Hazlo antes de que empiece el draft."
                    },
                    {
                        name: "2️⃣ Durante la Fase de Selección",
                        value: "Cuando sea tu turno, los botones para \"Elegir\" se activarán para ti en la web. La interfaz es inteligente y te mostrará a los especialistas (posición primaria) primero."
                    },
                    {
                        name: "3️⃣ Reglas de Fichaje (Cuotas)",
                        value: "Recuerda que debes respetar los límites de jugadores por posición. Si un fichaje falla, la web te avisará con un error. Los límites son:\n```\n" + maxQuotasText + "\n```"
                    },
                    {
                        name: "4️⃣ Gestión de tu Equipo (Después del Draft)",
                        value: "Una vez finalizada la selección, podrás acceder a la sección **\"Gestionar Mi Equipo\"** desde la web (estando logueado)."
                    }
                );

            await user.send({ embeds: [embed], components: [loginButtonRow] });

        } catch (e) { console.warn(`No se pudo enviar MD de aprobación de draft al capitán ${captainData.userId}:`, e.message); }
    }

    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
    await notifyVisualizer(updatedDraft);

    postTournamentUpdate('NEW_CAPTAIN_APPROVED', { captainData, draft: updatedDraft }).catch(console.error);
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
    await notifyVisualizer(updatedDraft);
}


export async function approveUnregisterFromDraft(client, draft, userIdToUnregister) {
    const player = draft.players.find(p => p.userId === userIdToUnregister);

    if (!player) {
        console.warn(`[Draft] approveUnregisterFromDraft: El jugador ${userIdToUnregister} ya no existe en el draft ${draft.shortId}. Ignorando.`);
        return { success: false, message: 'El jugador ya no estaba en el draft (puede que haya sido expulsado manualmente).' };
    }

    const captainId = player.captainId;

    await kickPlayerFromDraft(client, draft, userIdToUnregister);

    if (/^\d+$/.test(userIdToUnregister)) {
        try {
            const user = await client.users.fetch(userIdToUnregister);
            await user.send(`✅ Tu solicitud de baja del draft **${draft.name}** ha sido **procesada con éxito**.`);
        } catch (e) { console.warn('No se pudo notificar al usuario de la baja de draft aprobada'); }
    }

    if (captainId && /^\d+$/.test(captainId)) {
        try {
            const captainUser = await client.users.fetch(captainId);
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('ℹ️ Jugador Dado de Baja de tu Equipo')
                .setDescription(`El jugador **${player.psnId}** se ha dado de baja. Tienes una plaza libre en tu plantilla.\n\nPuedes usar el botón de abajo para invitar a un agente libre como reemplazo.`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_invite_replacement_start:${draft.shortId}:${captainId}:${userIdToUnregister}`)
                    .setLabel('Invitar Reemplazo')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );

            await captainUser.send({ embeds: [embed], components: [row] });
        } catch (e) { console.warn(`No se pudo notificar al capitán ${captainId} de la baja aprobada.`); }
    }
}
export async function requestUnregisterFromDraft(client, draft, userId, reason) {
    const player = draft.players.find(p => p.userId === userId);
    if (!player) {
        return { success: false, message: "No estás inscrito en este draft." };
    }

    const isCaptain = draft.captains.some(c => c.userId === userId);
    if (isCaptain) {
        return { success: false, message: "Los capitanes no pueden solicitar la baja automáticamente. Debe ser gestionado por un administrador." };
    }

    const notificationsThread = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId).catch(() => null);

    // Si el draft está en fase de inscripción -> Baja automática
    if (draft.status === 'inscripcion') {
        // Ejecutar baja automática
        await approveUnregisterFromDraft(client, draft, userId);

        if (notificationsThread) {
            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('👋 Un Jugador se ha dado de baja')
                .setDescription(`El jugador **${player.userName}** (${player.psnId}) se ha dado de baja del draft automáticamente.`)
                .addFields({ name: 'Motivo', value: reason || 'N/A' })
                .setFooter({ text: `Draft: ${draft.name} | ID del Jugador: ${userId}` });

            if (player.captainId) {
                embed.addFields({ name: 'Equipo que abandona', value: `Equipo de <@${player.captainId}>` });
            }

            await notificationsThread.send({ embeds: [embed] });
        }

        return { success: true, message: "✅ Te has dado de baja del draft correctamente." };
    }
    // Si el draft YA HA EMPEZADO (ej. 'seleccion' o 'finalizado') -> Requiere aprobación de admin
    else {
        if (!notificationsThread) {
            return { success: false, message: "Error interno del bot al encontrar el canal de notificaciones." };
        }

        const embed = new EmbedBuilder()
            .setColor('#e67e22') // Naranja de advertencia/revisión
            .setTitle('👋 Solicitud de Baja de Jugador')
            .setDescription(`El jugador **${player.userName}** (${player.psnId}) solicita darse de baja, pero el draft **ya ha comenzado**.\nRequiere aprobación manual.`)
            .addFields({ name: 'Motivo / Estado', value: reason || 'N/A' })
            .setFooter({ text: `Draft: ${draft.name} | ID del Jugador: ${userId}` });

        if (player.captainId) {
            embed.addFields({ name: 'Equipo Actual', value: `Equipo de <@${player.captainId}>` });
        }

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_unregister_draft_approve:${draft.shortId}:${userId}`).setLabel('Aprobar Baja (Eliminar)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`admin_unregister_draft_reject:${draft.shortId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

        await notificationsThread.send({ embeds: [embed], components: [row] });

        if (player.captainId) {
            try {
                const captainUser = await client.users.fetch(player.captainId);
                await captainUser.send(`⚠️ **Alerta de Plantilla:** El jugador **${player.psnId}** ha solicitado darse de baja de tu equipo.\nEl draft ya ha comenzado, un administrador revisará la solicitud.`);
            } catch (e) { console.warn(`No se pudo notificar al capitán ${player.captainId} de la solicitud de baja.`); }
        }

        return { success: true, message: "⚠️ El draft ya ha comenzado. Tu solicitud de baja ha sido enviada a los administradores para su evaluación." };
    }
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
    await deleteResourceSafe(client.channels.fetch.bind(client.channels), discordMessageIds.casterTextChannelId);
    await deleteResourceSafe(client.channels.fetch.bind(client.channels), discordMessageIds.warRoomVoiceChannelId);

    try {
        const globalChannel = await client.channels.fetch(CHANNELS.DRAFTS_STATUS);
        await deleteResourceSafe(globalChannel.messages.fetch.bind(globalChannel.messages), discordMessageIds.statusMessageId);
    } catch (e) {
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
        await notifyVisualizer(finalDraftState);

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

export async function createTournamentFromDraft(client, guild, draftShortId, formatId, leagueConfig = {}) {
    await setBotBusy(true);
    const db = getDb();

    try {
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft || draft.status !== 'finalizado') {
            throw new Error('Este draft no ha finalizado o no existe.');
        }

        // FIX: Comprobar si ya existe un torneo creado desde este draft (evitar doble-clic / E11000)
        const tournamentShortId = `draft-${draft.shortId}`;
        const existingTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (existingTournament) {
            console.warn(`[CREATE TOURNAMENT FROM DRAFT] El torneo ${tournamentShortId} ya existe. Retornando el existente.`);
            return existingTournament;
        }

        const approvedTeams = {};
        for (const captain of draft.captains) {
            const teamPlayers = draft.players.filter(p => p.captainId === captain.userId);
            const teamData = {
                id: captain.userId, nombre: captain.teamName, eafcTeamName: captain.eafcTeamName,
                capitanId: captain.userId, capitanTag: captain.userName,
                coCaptainId: null, coCaptainTag: null, bandera: '🏳️', paypal: null,
                streamChannel: captain.streamChannel, twitter: captain.twitter,
                inscritoEn: new Date(), players: teamPlayers
            };
            approvedTeams[captain.userId] = teamData;
        }

        const tournamentName = `Torneo Draft - ${draft.name}`;
        // tournamentShortId ya declarado arriba en el guard de duplicados
        const format = TOURNAMENT_FORMATS[formatId];
        if (!format) throw new Error(`Formato de torneo inválido: ${formatId}`);

        const config = {
            formatId: formatId, format: format, isPaid: draft.config.isPaid,
            entryFee: draft.config.entryFee, prizeCampeon: draft.config.prizeCampeon,
            prizeFinalista: draft.config.prizeFinalista, startTime: null,
            ...leagueConfig
        };

        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID);
        const casterRole = await guild.roles.fetch(CASTER_ROLE_ID).catch(() => null);

        const participantsAndStaffPermissions = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ...Object.keys(approvedTeams).filter(id => /^\d+$/.test(id)).map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel] }))
        ];

        const infoChannel = await guild.channels.create({ name: `🏆-${tournamentShortId}-info`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] }] });
        const matchesChannel = await guild.channels.create({ name: `⚽-${tournamentShortId}-partidos`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });
        const chatChannel = await guild.channels.create({ name: `💬-${tournamentShortId}-chat`, type: ChannelType.GuildText, parent: TOURNAMENT_CATEGORY_ID, permissionOverwrites: participantsAndStaffPermissions });

        const newTournament = {
            _id: new ObjectId(), shortId: tournamentShortId, guildId: guild.id, nombre: tournamentName, status: 'inscripcion_abierta',
            draftId: draft.shortId, // Vínculo esencial con el draft original
            config, teams: { pendientes: {}, aprobados: approvedTeams, reserva: {}, coCapitanes: {} },
            structure: { grupos: {}, calendario: {}, eliminatorias: { rondaActual: null } },
            discordChannelIds: { infoChannelId: infoChannel.id, matchesChannelId: matchesChannel.id, chatChannelId: chatChannel.id },
            discordMessageIds: {}
        };

        const globalStatusChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_STATUS);
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
                const realPlayerIds = team.players.map(p => p.userId).filter(id => /^\d+$/.test(id));

                const voicePermissions = [
                    // El canal es PÚBLICO por defecto guiado por la categoría, así que el @everyone entra
                    { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ];

                // Permisos de moderación para el capitán
                if (/^\d+$/.test(team.capitanId)) {
                    voicePermissions.push({
                        id: team.capitanId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.Speak,
                            PermissionsBitField.Flags.MuteMembers,
                            PermissionsBitField.Flags.DeafenMembers,
                            PermissionsBitField.Flags.MoveMembers
                        ]
                    });
                }

                await guild.channels.create({
                    name: `🔊 ${team.nombre}`, type: ChannelType.GuildVoice,
                    parent: teamCategory, permissionOverwrites: voicePermissions
                });

                if (/^\d+$/.test(team.capitanId)) {
                    await chatChannel.send({
                        content: `<@${team.capitanId}>, puedes invitar a tu co-capitán desde aquí:`,
                        components: [new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`invite_cocaptain_start:${newTournament.shortId}`)
                                .setLabel('Invitar Co-Capitán')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('🤝')
                        )],
                        flags: [MessageFlags.Ephemeral]
                    });
                }
            }
        }

        for (const member of arbitroRole.members.values()) { await managementThread.members.add(member.id).catch(() => { }); await notificationsThread.members.add(member.id).catch(() => { }); }
        if (casterRole) { for (const member of casterRole.members.values()) { await casterThread.members.add(member.id).catch(() => { }); } }

        await managementThread.send(createTournamentManagementPanel(newTournament, true));

        await publishTournamentVisualizerURL(client, newTournament);

        await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { status: 'torneo_generado' } });

        const finalTournament = await db.collection('tournaments').findOne({ _id: newTournament._id });
        await notifyTournamentVisualizer(finalTournament);
        for (const teamData of Object.values(finalTournament.teams.aprobados)) {
            await notifyCastersOfNewTeam(client, finalTournament, teamData);
        }

        const draftChannel = await client.channels.fetch(draft.discordChannelId).catch(() => null);
        if (draftChannel) {
            await draftChannel.send('✅ **Torneo generado con éxito.** Este canal permanecerá como archivo para consultar las plantillas de los equipos.');
        }

        const finalDraftState = await db.collection('drafts').findOne({ _id: draft._id });
        await updateCaptainControlPanel(client, finalDraftState);
        await updateDraftManagementPanel(client, finalDraftState);

        return finalTournament;

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
        const casterRole = await guild.roles.fetch(CASTER_ROLE_ID).catch(() => null);

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
            _id: new ObjectId(), shortId, guildId: guild.id, name, draftName: name, status: 'inscripcion', createdAt: new Date(),
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
                captainControlPanelMessageId: null,
                casterTextChannelId: null,
                warRoomVoiceChannelId: null
            }
        };

        const [playersEmbeds, teamsEmbed, turnOrderEmbed] = createDraftMainInterface(newDraft);
        const playersMessage = await draftChannel.send({ embeds: playersEmbeds });
        const teamsMessage = await draftChannel.send({ embeds: [teamsEmbed] });
        const turnOrderMessage = await draftChannel.send({ embeds: [turnOrderEmbed] });

        newDraft.discordMessageIds.mainInterfacePlayerMessageId = playersMessage.id;
        newDraft.discordMessageIds.mainInterfaceTeamsMessageId = teamsMessage.id;
        newDraft.discordMessageIds.turnOrderMessageId = turnOrderMessage.id;

        const globalStatusChannel = await client.channels.fetch(CHANNELS.DRAFTS_STATUS);
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

        const basePermissions = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        if (casterRole) basePermissions.push({ id: casterRole.id, allow: [PermissionsBitField.Flags.ViewChannel] });
        if (arbitroRole) basePermissions.push({ id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel] });

        const casterTextChannel = await guild.channels.create({
            name: `🔴-directo-draft-${shortId}`,
            type: ChannelType.GuildText,
            parent: CHANNELS.CASTER_DRAFT_CATEGORY_ID,
            permissionOverwrites: basePermissions
        });
        newDraft.discordMessageIds.casterTextChannelId = casterTextChannel.id;

        await db.collection('drafts').insertOne(newDraft);

        if (arbitroRole) {
            for (const member of arbitroRole.members.values()) {
                await managementThread.members.add(member.id).catch(() => { });
                await notificationsThread.members.add(member.id).catch(() => { });
                await casterTextChannel.permissionOverwrites.edit(member.id, { ViewChannel: true }).catch(() => { });
            }
        }
        if (casterRole) {
            for (const member of casterRole.members.values()) {
                await casterTextChannel.permissionOverwrites.edit(member.id, { ViewChannel: true }).catch(() => { });
            }
        }

        await managementThread.send(createDraftManagementPanel(newDraft, true));

        const finalDraft = await db.collection('drafts').findOne({ _id: newDraft._id });
        if (finalDraft) {
            await notifyVisualizer(finalDraft);
            await publishDraftVisualizerURL(client, finalDraft);
        }

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

        const settings = await getBotSettings();
        const minQuotas = Object.fromEntries(settings.draftMinQuotas.split(',').map(q => q.split(':')));
        const positionCounts = {};
        Object.keys(minQuotas).forEach(p => positionCounts[p] = 0);

        const allPlayers = draft.players;
        for (const player of allPlayers) {
            let primary = player.primaryPosition;
            let secondary = player.secondaryPosition;

            if (positionCounts[primary] !== undefined) positionCounts[primary]++;

            if (secondary && secondary !== 'NONE' && secondary !== primary) {
                if (positionCounts[secondary] !== undefined) positionCounts[secondary]++;
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

        const captainIds = draft.captains.map(c => c.userId);
        for (let i = captainIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [captainIds[i], captainIds[j]] = [captainIds[j], captainIds[i]];
        }

        const casterRole = await guild.roles.fetch(CASTER_ROLE_ID).catch(() => null);
        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);

        const voicePermissions = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ];
        if (casterRole) voicePermissions.push({ id: casterRole.id, allow: [PermissionsBitField.Flags.ViewChannel] });
        if (arbitroRole) voicePermissions.push({ id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel] });
        draft.captains.forEach(c => {
            if (/^\d+$/.test(c.userId)) {
                voicePermissions.push({ id: c.userId, allow: [PermissionsBitField.Flags.ViewChannel] });
            }
        });

        const warRoomVoiceChannel = await guild.channels.create({
            name: `🎙️ War Room Draft: ${draft.name}`,
            type: ChannelType.GuildVoice,
            parent: CHANNELS.CASTER_DRAFT_CATEGORY_ID,
            permissionOverwrites: voicePermissions
        });

        await db.collection('drafts').updateOne(
            { _id: draft._id },
            {
                $set: {
                    status: 'seleccion',
                    'selection.order': captainIds,
                    'selection.turn': 0,
                    'selection.currentPick': 1,
                    'selection.isPicking': false,
                    'selection.activeInteractionId': null,
                    'discordMessageIds.warRoomVoiceChannelId': warRoomVoiceChannel.id
                }
            }
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
        await notifyVisualizer(draft);

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

    const totalPicks = draft.captains.length * 10;
    if (draft.selection.currentPick >= totalPicks) {
        await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { status: 'finalizado', "selection.isPicking": false, "selection.activeInteractionId": null } });
        const finalDraftState = await db.collection('drafts').findOne({ _id: draft._id });

        await updateDraftManagementPanel(client, finalDraftState);
        await updateDraftMainInterface(client, finalDraftState.shortId);
        await updatePublicMessages(client, finalDraftState);
        await updateCaptainControlPanel(client, finalDraftState);
        await notifyVisualizer(finalDraftState); // FIX: Notificar a la web para que renderice el pick 11 y muestre estado finalizado

        // FIX: Enviar mensaje de finalización al canal de Discord
        try {
            const draftChannel = await client.channels.fetch(finalDraftState.discordChannelId);
            if (draftChannel) {
                await draftChannel.send('**✅ ¡LA FASE DE SELECCIÓN HA SIDO COMPLETADA! Ya se puede proceder a crear el torneo.**');
            }
        } catch (e) { console.warn('[DRAFT] No se pudo enviar mensaje de finalización:', e.message); }

        return;
    }

    // Calcular el SIGUIENTE turno directamente desde el pick actual (evitando off-by-one con incrementos)
    const nextPick = draft.selection.currentPick + 1; // El pick que se va a mostrar ahora
    const numCaptains = draft.captains.length;
    const nextRound = Math.floor((nextPick - 1) / numCaptains);  // Ronda 0-indexed
    const posInRound = (nextPick - 1) % numCaptains;             // Posición dentro de la ronda

    // Snake: rondas pares van 0→N-1, rondas impares van N-1→0
    const nextTurnIndex = (nextRound % 2 === 0) ? posInRound : (numCaptains - 1 - posInRound);

    await db.collection('drafts').updateOne(
        { _id: draft._id },
        {
            $set: { "selection.turn": nextTurnIndex, "selection.isPicking": false, "selection.activeInteractionId": null },
            $inc: { "selection.currentPick": 1 },
        }
    );

    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await notifyVisualizer(updatedDraft);
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updateCaptainControlPanel(client, updatedDraft);
}

// --- REEMPLAZA LA FUNCIÓN createNewTournament ENTERA CON ESTA VERSIÓN ---

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
        } catch (error) {
            await cleanupFailedCreation(client, createdResources);
            return { success: false, message: "Fallo al crear los canales base del torneo." };
        }

        // --- INICIO DE LA LÓGICA CORREGIDA ---
        const newTournament = {
            _id: new ObjectId(), shortId, guildId: guild.id, nombre: name, status: 'inscripcion_abierta', createdAt: new Date(),
            config: {
                ...config, // Copia TODA la configuración que llega (incl. qualifiers y totalRounds)
                format: format, // Añade el objeto de formato completo
                matchType: config.matchType || 'ida',
            },
            teams: { pendientes: {}, aprobados: {}, reserva: {}, coCapitanes: {} },
            structure: { grupos: {}, calendario: {}, eliminatorias: { rondaActual: null } },
            discordChannelIds: { infoChannelId: infoChannel.id, matchesChannelId: matchesChannel.id, chatChannelId: chatChannel.id },
            discordMessageIds: { statusMessageId: null, classificationMessageId: null, calendarMessageId: null, managementThreadId: null, notificationsThreadId: null, casterThreadId: null }
        };
        // --- FIN DE LA LÓGICA CORREGIDA ---

        const globalStatusChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_STATUS);
        const statusMsg = await globalStatusChannel.send(createTournamentStatusEmbed(newTournament));
        createdResources.messages.push({ channelId: globalStatusChannel.id, messageId: statusMsg.id });
        const classificationMsg = await infoChannel.send(createClassificationEmbed(newTournament));
        const calendarMsg = await infoChannel.send(createCalendarEmbed(newTournament));
        newTournament.discordMessageIds = { ...newTournament.discordMessageIds, statusMessageId: statusMsg.id, classificationMessageId: classificationMsg.id, calendarMessageId: calendarMsg.id };

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
        } catch (error) {
            await cleanupFailedCreation(client, createdResources);
            return { success: false, message: "Fallo al crear los hilos de gestión." };
        }

        await db.collection('tournaments').insertOne(newTournament);

        if (arbitroRole) {
            for (const member of arbitroRole.members.values()) {
                await managementThread.members.add(member.id).catch(() => { });
                await notificationsThread.members.add(member.id).catch(() => { });
            }
        }
        if (casterRole) {
            for (const member of casterRole.members.values()) {
                await casterThread.members.add(member.id).catch(() => { });
            }
        }

        await managementThread.send(createTournamentManagementPanel(newTournament, false));

        const finalTournament = await db.collection('tournaments').findOne({ _id: newTournament._id });
        if (finalTournament) {
            await notifyTournamentVisualizer(finalTournament);
            await publishTournamentVisualizerURL(client, finalTournament);
        }
        console.log(`[CREATE] Panel de gestión y URL del visualizador enviados para ${shortId}.`);

        (async () => {
            const settings = await getBotSettings();
            if (!settings.twitterEnabled) return;
            const notificationsThread = await client.channels.fetch(finalTournament.discordMessageIds.notificationsThreadId).catch(() => null);
            if (!notificationsThread) return;
            const statusMessage = await notificationsThread.send('⏳ Intentando generar el tweet de anuncio...');
            const result = await postTournamentUpdate('INSCRIPCION_ABIERTA', finalTournament);
            if (result && result.success) await statusMessage.edit('✅ Tweet de anuncio generado con éxito.');
            else {
                await statusMessage.edit('❌ Hubo un error al intentar generar el tweet de anuncio.');
                console.error("Fallo en postTournamentUpdate:", result?.error);
            }
        })();

        await setBotBusy(false);
        return { success: true, tournament: finalTournament };

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
            const channel = await client.channels.fetch(id).catch(() => null);
            if (channel) await channel.delete('Limpieza por creación de torneo fallida.');
        } catch (e) { console.warn(`No se pudo limpiar el canal ${id}: ${e.message}`); }
    };
    for (const id of [...resources.channels, ...resources.threads]) {
        await deleteChannel(id);
    }
    for (const msg of resources.messages) {
        try {
            const channel = await client.channels.fetch(msg.channelId).catch(() => null);
            if (channel) await channel.messages.delete(msg.messageId).catch(() => { });
        } catch (e) { console.warn(`No se pudo limpiar el mensaje ${msg.messageId}`); }
    }
    console.log("[CLEANUP] Limpieza completada.");
}

export async function startGroupStage(client, guild, tournament) {
    await setBotBusy(true);
    try {
        const db = getDb();
        let tournamentData = await db.collection('tournaments').findOne({ _id: tournament._id });
        if (tournamentData.status !== 'inscripcion_abierta') { return; }

        // Paso 1: Generar el calendario y guardarlo en la base de datos
        if (tournamentData.config.formatId === 'flexible_league') {
            await generateFlexibleLeagueSchedule(tournamentData);
        } else {
            await generateGroupBasedSchedule(tournamentData);
        }

        // --- INICIO DE LA LÓGICA CORREGIDA Y DEFINITIVA ---
        // Paso 2: Volver a cargar la versión MÁS RECIENTE del torneo desde la DB
        const updatedTournament = await db.collection('tournaments').findOne({ _id: tournamentData._id });

        // Paso 3: Ahora sí, crear los hilos de la Jornada 1
        const allMatches = Object.values(updatedTournament.structure.calendario).flat();
        // Limpiar partidos atascados en 'creando_hilo' por más de 30 segundos (crash recovery)
        for (const groupKey of Object.keys(updatedTournament.structure.calendario)) {
            const matches = updatedTournament.structure.calendario[groupKey];
            for (let i = 0; i < matches.length; i++) {
                if (matches[i].status === 'creando_hilo' && matches[i].lockedAt && (Date.now() - new Date(matches[i].lockedAt).getTime()) > 30000) {
                    await db.collection('tournaments').updateOne(
                        { _id: updatedTournament._id },
                        { $set: { [`structure.calendario.${groupKey}.${i}.status`]: 'pendiente' }, $unset: { [`structure.calendario.${groupKey}.${i}.lockedAt`]: '' } }
                    );
                    console.log(`[RECOVERY] Desbloqueado partido atascado: ${matches[i].matchId}`);
                }
            }
        }

        for (const match of allMatches) {
            if (match.jornada === 1 && !match.threadId && match.equipoA.id !== 'ghost' && match.equipoB.id !== 'ghost') {
                const groupKey = match.nombreGrupo;

                // Bloqueo atómico robusto usando $elemMatch con matchId (no índices)
                const result = await db.collection('tournaments').findOneAndUpdate(
                    {
                        _id: updatedTournament._id,
                        [`structure.calendario.${groupKey}`]: {
                            $elemMatch: {
                                matchId: match.matchId,
                                threadId: null
                            }
                        }
                    },
                    { $set: { [`structure.calendario.${groupKey}.$.status`]: 'creando_hilo', [`structure.calendario.${groupKey}.$.lockedAt`]: new Date() } },
                    { returnDocument: 'after' }
                );

                if (!result) {
                    console.log(`[GROUP STAGE] Hilo para ${match.matchId} ya gestionado.`);
                    continue;
                }

                try {
                    const threadId = await createMatchThread(client, guild, match, updatedTournament.discordChannelIds.matchesChannelId, updatedTournament.shortId);

                    if (threadId) {
                        await db.collection('tournaments').updateOne(
                            {
                                _id: updatedTournament._id,
                                [`structure.calendario.${groupKey}.matchId`]: match.matchId
                            },
                            {
                                $set: {
                                    [`structure.calendario.${groupKey}.$.threadId`]: threadId,
                                    [`structure.calendario.${groupKey}.$.status`]: 'en_curso'
                                }
                            }
                        );
                    } else {
                        await db.collection('tournaments').updateOne(
                            {
                                _id: updatedTournament._id,
                                [`structure.calendario.${groupKey}.matchId`]: match.matchId
                            },
                            { $set: { [`structure.calendario.${groupKey}.$.status`]: 'pendiente' } }
                        );
                    }
                } catch (error) {
                    console.error(`[ERROR] Fallo al crear hilo en startGroupStage para ${match.matchId}:`, error);
                    await db.collection('tournaments').updateOne(
                        {
                            _id: updatedTournament._id,
                            [`structure.calendario.${groupKey}.matchId`]: match.matchId
                        },
                        { $set: { [`structure.calendario.${groupKey}.$.status`]: 'pendiente' } }
                    );
                }
                // Pausa entre creaciones de hilos para evitar rate limit de Discord
                await new Promise(r => setTimeout(r, 1500));
            }
        }
        // --- FIN DE LA LÓGICA CORREGIDA ---

        // --- FIX: Generar canales de audio si es torneo de pago ---
        if (updatedTournament.config.isPaid) {
            const teamCategory = await guild.channels.fetch(TEAM_CHANNELS_CATEGORY_ID).catch(() => null);
            const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);

            if (teamCategory && arbitroRole) {
                console.log(`[CHANNELS] Creando canales de equipo automáticos para el torneo de pago ${updatedTournament.shortId}`);
                for (const team of Object.values(updatedTournament.teams.aprobados)) {
                    const voicePermissions = [
                        { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                    ];

                    // Permisos de moderador para el capitán (igual que en los drafts)
                    if (/^\d+$/.test(team.capitanId)) {
                        voicePermissions.push({
                            id: team.capitanId,
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.Connect,
                                PermissionsBitField.Flags.Speak,
                                PermissionsBitField.Flags.MuteMembers,
                                PermissionsBitField.Flags.DeafenMembers,
                                PermissionsBitField.Flags.MoveMembers
                            ]
                        });
                    }

                    await guild.channels.create({
                        name: `🔊 ${team.nombre}`,
                        type: ChannelType.GuildVoice,
                        parent: teamCategory,
                        permissionOverwrites: voicePermissions
                    }).catch(error => console.error(`[CHANNELS] Error al crear canal para ${team.nombre}:`, error));

                    // Pequeña pausa para no hacer spam a la API de Discord
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                console.warn(`[CHANNELS] No se pudo crear canales de equipo para ${updatedTournament.shortId} por falta de categoría o rol.`);
            }
        }
        // --- FIN FIX ---

        // Paso 4: Actualizar todas las interfaces públicas
        const finalTournamentState = await db.collection('tournaments').findOne({ _id: tournamentData._id });
        await updatePublicMessages(client, finalTournamentState);
        // await updateTournamentManagementThread(client, finalTournamentState); // REMOVED: Managed by finally block via setBotBusy(false)

        postTournamentUpdate('GROUP_STAGE_START', finalTournamentState).catch(console.error);
        await notifyTournamentVisualizer(finalTournamentState);

    } catch (error) {
        console.error(`Error durante el sorteo del torneo ${tournament.shortId}:`, error);
    } finally {
        await setBotBusy(false);
    }
}
export async function approveTeam(client, tournament, teamData) {
    console.log(`[DEBUG] approveTeam called for ${teamData.nombre} (Captain: ${teamData.capitanId})`);
    const db = getDb();
    let latestTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!latestTournament.teams.aprobados) latestTournament.teams.aprobados = {};
    if (!latestTournament.teams.reserva) latestTournament.teams.reserva = {};

    const maxTeams = latestTournament.config.format.size;
    const currentApprovedTeamsCount = Object.keys(latestTournament.teams.aprobados).length;

    if (latestTournament.config.format.size === 0 || currentApprovedTeamsCount < maxTeams) {
        // --- PHASE 3: MANAGER INTEGRATION ---
        try {
            const registeredTeam = await getDb('test').collection('teams').findOne({ name: { $regex: new RegExp(`^${teamData.nombre}$`, 'i') }, guildId: tournament.guildId });
            if (registeredTeam && registeredTeam.managerId) {
                console.log(`[MANAGER SYNC] Linking manager ${registeredTeam.managerId} to tournament team ${teamData.nombre}`);
                teamData.managerId = registeredTeam.managerId;
            }
        } catch (err) {
            console.warn(`[MANAGER SYNC] Failed to lookup manager for team ${teamData.nombre}:`, err);
        }
        // --- END PHASE 3 ---

        latestTournament.teams.aprobados[teamData.capitanId] = teamData;
        if (latestTournament.teams.pendientes[teamData.capitanId]) delete latestTournament.teams.pendientes[teamData.capitanId];
        if (latestTournament.teams.reserva[teamData.capitanId]) delete latestTournament.teams.reserva[teamData.capitanId];

        if (/^\d+$/.test(teamData.capitanId)) {
            try {
                console.log(`[DEBUG] Fetching user ${teamData.capitanId} for notification...`);
                const user = await client.users.fetch(teamData.capitanId);
                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle(`✅ Aprobado para ${latestTournament.nombre}`)
                    .setDescription(`🇪🇸 ¡Enhorabuena! Tu equipo **${teamData.nombre}** ha sido **aprobado** y ya forma parte del torneo.\n\n🇬🇧 Congratulations! Your team **${teamData.nombre}** has been **approved** and is now part of the tournament.`);

                if (teamData.isManualRegistration) {
                    embed.addFields(
                        { name: '📝 Registro Manual / Manual Registration', value: 'Admin Action' },
                        { name: '💰 Ref. Pago / Payment Ref', value: `\`${teamData.paypal || 'N/A'}\``, inline: true },
                        { name: '📺 Stream', value: teamData.streamChannel || 'N/A', inline: true }
                    );
                }

                await user.send({ embeds: [embed] });
                console.log(`[DEBUG] Notification sent to ${teamData.capitanId}`);

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

                let welcomeContent = `👋 ¡Bienvenido, <@${teamData.capitanId}>! (${teamData.nombre}).`;
                if (teamData.extraCaptains && teamData.extraCaptains.length > 0) {
                    const extraPings = teamData.extraCaptains.map(id => `<@${id}>`).join(', ');
                    welcomeContent = `👋 ¡Bienvenidos, <@${teamData.capitanId}> y ${extraPings}! (${teamData.nombre}).`;
                }

                await chatChannel.send({
                    content: `${welcomeContent}\n*Puedes usar el botón de abajo para invitar a tu co-capitán.*`,
                    components: [inviteButtonRow]
                });

            } catch (e) {
                console.error(`Error al notificar al capitán ${teamData.capitanId} sobre la aprobación o al dar permisos:`, e);
            }
        }
        await notifyCastersOfNewTeam(client, latestTournament, teamData);

    } else {
        latestTournament.teams.reserva[teamData.capitanId] = teamData;
        if (latestTournament.teams.pendientes[teamData.capitanId]) delete latestTournament.teams.pendientes[teamData.capitanId];
        if (latestTournament.teams.aprobados[teamData.capitanId]) delete latestTournament.teams.aprobados[teamData.capitanId];

        if (/^\d+$/.test(teamData.capitanId)) {
            try {
                const user = await client.users.fetch(teamData.capitanId);
                const embed = new EmbedBuilder()
                    .setColor('#f1c40f')
                    .setTitle(`⚠️ En Lista de Reserva para ${latestTournament.nombre}`)
                    .setDescription(`🇪🇸 ¡Hola! Tu equipo **${teamData.nombre}** ha sido añadido a la **lista de reserva** para el torneo **${latestTournament.nombre}**.\nActualmente, el torneo está completo, pero si se libera un espacio, tu equipo será considerado automáticamente.\n\n🇬🇧 Hello! Your team **${teamData.nombre}** has been added to the **reserve list** for the **${latestTournament.nombre}** tournament.\nThe tournament is currently full, but if a spot opens up, your team will be automatically considered.`);
                await user.send({ embeds: [embed] });
            } catch (e) {
                console.error(`Error al notificar al capitán ${teamData.capitanId} sobre la lista de reserva:`, e);
            }
        }
    }

    // --- DEFENSIVE CODING: Limpiar aprobados antes de guardar ---
    const cleanApproved = {};
    Object.entries(latestTournament.teams.aprobados || {}).forEach(([key, value]) => {
        if (value && value.id) cleanApproved[key] = value;
    });
    latestTournament.teams.aprobados = cleanApproved;

    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { 'teams.aprobados': latestTournament.teams.aprobados, 'teams.pendientes': latestTournament.teams.pendientes, 'teams.reserva': latestTournament.teams.reserva } });

    // --- INICIO LÓGICA EXTRA CAPTAINS ---
    if (teamData.extraCaptains && Array.isArray(teamData.extraCaptains) && teamData.extraCaptains.length > 0) {
        try {
            const chatChannel = await client.channels.fetch(latestTournament.discordChannelIds.chatChannelId).catch(() => null);
            const matchesChannel = await client.channels.fetch(latestTournament.discordChannelIds.matchesChannelId).catch(() => null);

            if (chatChannel && matchesChannel) {
                for (const extraCaptainId of teamData.extraCaptains) {
                    if (/^\d+$/.test(extraCaptainId)) {
                        try {
                            // CORRECCIÓN: Resolver el miembro antes de editar permisos para evitar InvalidType
                            const guild = await client.guilds.fetch(latestTournament.guildId);
                            const extraMember = await guild.members.fetch(extraCaptainId).catch(() => null);
                            if (!extraMember) {
                                console.warn(`[EXTRA CAPTAIN] No se encontró al miembro ${extraCaptainId} en el servidor. Omitiendo permisos.`);
                                continue;
                            }

                            // Dar permisos en los canales del torneo usando el miembro resuelto
                            await chatChannel.permissionOverwrites.edit(extraMember, { ViewChannel: true, SendMessages: true });
                            await matchesChannel.permissionOverwrites.edit(extraMember, { ViewChannel: true, SendMessages: false });

                            // Notificar al usuario
                            const user = extraMember.user;
                            if (user) {
                                const embed = new EmbedBuilder()
                                    .setColor('#2ecc71')
                                    .setTitle(`✅ Añadido como Capitán Adicional`)
                                    .setDescription(`Has sido añadido como capitán adicional del equipo **${teamData.nombre}** en el torneo **${latestTournament.nombre}**.\n\nTienes acceso a los canales de chat y partidos para gestionar a tu equipo.`);
                                await user.send({ embeds: [embed] }).catch(() => null);
                            }

                            // Añadir al hilo de notificaciones
                            const notificationsThread = await client.channels.fetch(latestTournament.discordMessageIds.notificationsThreadId).catch(() => null);
                            if (notificationsThread) await notificationsThread.members.add(extraCaptainId).catch(() => { });

                        } catch (e) {
                            console.error(`Error al procesar extraCaptain ${extraCaptainId}:`, e);
                        }
                    }
                }
            } else {
                console.warn(`[WARNING] No se pudieron encontrar los canales de chat o partidos para dar permisos a los capitanes extra del equipo ${teamData.nombre}.`);
            }
        } catch (error) {
            console.error(`[ERROR] Fallo general al procesar capitanes extra para ${teamData.nombre}:`, error);
        }
    }
    // --- FIN LÓGICA EXTRA CAPTAINS ---

    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });

    await updatePublicMessages(client, updatedTournament);
    await updateTournamentManagementThread(client, updatedTournament);
    await notifyTournamentVisualizer(updatedTournament);
}

export async function addCoCaptain(client, tournament, captainId, coCaptainId) {
    const db = getDb();
    const guild = await client.guilds.fetch(tournament.guildId);
    const coCaptainUser = await client.users.fetch(coCaptainId);

    // Obtenemos el torneo más actualizado para evitar conflictos
    const latestTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    const team = latestTournament.teams.aprobados[captainId];

    if (!team) {
        console.error(`[ERROR] No se encontró el equipo aprobado para el capitán ${captainId} en el torneo ${latestTournament.shortId}`);
        return;
    }

    // --- INICIO LÓGICA REEMPLAZO CO-CAPITÁN ---
    if (team.coCaptainId) {
        const oldCoCaptainId = team.coCaptainId;
        console.log(`[INFO] Reemplazando co-capitán anterior: ${oldCoCaptainId}`);

        // 1. Notificar al antiguo co-capitán
        try {
            const oldCoCaptainUser = await client.users.fetch(oldCoCaptainId);
            const kickEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle(`⚠️ Reemplazo de Co-Capitanía / Co-Captain Replacement`)
                .setDescription(`🇪🇸 Has sido reemplazado como co-capitán del equipo **${team.nombre}** en el torneo **${latestTournament.nombre}** porque el capitán ha invitado a otra persona.\n\n🇬🇧 You have been replaced as co-captain of team **${team.nombre}** in the **${latestTournament.nombre}** tournament because the captain has invited someone else.\n\n🚫 🇪🇸 Ya no tienes acceso a los canales de gestión del equipo.\n🇬🇧 You no longer have access to the team management channels.`);
            await oldCoCaptainUser.send({ embeds: [kickEmbed] });
        } catch (e) {
            console.warn(`No se pudo notificar al antiguo co-capitán ${oldCoCaptainId} de su expulsión.`);
        }

        // 2. Quitar permisos de canales (Chat y Partidos)
        if (latestTournament.discordChannelIds) {
            const { matchesChannelId, chatChannelId } = latestTournament.discordChannelIds;
            try {
                if (matchesChannelId) {
                    const matchesChannel = await guild.channels.fetch(matchesChannelId).catch(() => null);
                    if (matchesChannel) await matchesChannel.permissionOverwrites.delete(oldCoCaptainId).catch(() => { });
                }
                if (chatChannelId) {
                    const chatChannel = await guild.channels.fetch(chatChannelId).catch(() => null);
                    if (chatChannel) await chatChannel.permissionOverwrites.delete(oldCoCaptainId).catch(() => { });
                }
            } catch (error) {
                console.error(`Error al quitar permisos al antiguo co-capitán ${oldCoCaptainId}:`, error);
            }
        }

        // 3. Limpiar base de datos (se hace en el $set/$unset de abajo, pero es bueno tenerlo en cuenta)
        // La actualización de MongoDB más abajo sobrescribirá 'coCaptainId' y 'coCaptainTag', así que eso es automático.
    }
    // --- FIN LÓGICA REEMPLAZO CO-CAPITÁN ---

    // 1. Actualizamos la ficha general del equipo en la base de datos
    await db.collection('tournaments').updateOne(
        { _id: latestTournament._id },
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

    // 1.5. CRÍTICO: Dar permisos al co-capitán en el canal de partidos y chat
    if (latestTournament.discordChannelIds) {
        const { matchesChannelId, chatChannelId } = latestTournament.discordChannelIds;

        try {
            if (matchesChannelId) {
                const matchesChannel = await guild.channels.fetch(matchesChannelId).catch(() => null);
                if (matchesChannel) {
                    await matchesChannel.permissionOverwrites.create(coCaptainId, { ViewChannel: true });
                    console.log(`[DEBUG] Permisos de ViewChannel otorgados a ${coCaptainUser.tag} en ${matchesChannel.name}`);
                }
            }

            if (chatChannelId) {
                const chatChannel = await guild.channels.fetch(chatChannelId).catch(() => null);
                if (chatChannel) {
                    await chatChannel.permissionOverwrites.create(coCaptainId, { ViewChannel: true, SendMessages: true });
                    console.log(`[DEBUG] Permisos de Chat otorgados a ${coCaptainUser.tag} en ${chatChannel.name}`);

                    // Mensaje de bienvenida en el chat
                    await chatChannel.send({
                        content: `👋 ¡Bienvenido, <@${coCaptainId}>! Has sido añadido como co-capitán del equipo **${team.nombre}**.\n*Welcome! You have been added as co-captain of team **${team.nombre}**.*`
                    }).catch(() => null);
                }
            }
        } catch (error) {
            console.error(`[ERROR] No se pudieron actualizar los permisos de canales para el co-capitán ${coCaptainId}:`, error);
        }
    }

    // 2. CRÍTICO: Actualizamos los partidos YA EXISTENTES en el calendario
    if (latestTournament.structure) {
        let needsUpdate = false;
        const updates = {};

        // A. Actualizar Calendario (Fase de Grupos / Liga)
        if (latestTournament.structure.calendario) {
            const updatedCalendario = { ...latestTournament.structure.calendario };
            let calendarUpdated = false;

            for (const groupName in updatedCalendario) {
                updatedCalendario[groupName] = updatedCalendario[groupName].map(match => {
                    let matchUpdated = false;
                    if (match.equipoA.capitanId === captainId) {
                        match.equipoA.coCaptainId = coCaptainId;
                        match.equipoA.coCaptainTag = coCaptainUser.tag;
                        matchUpdated = true;
                    }
                    if (match.equipoB.capitanId === captainId) {
                        match.equipoB.coCaptainId = coCaptainId;
                        match.equipoB.coCaptainTag = coCaptainUser.tag;
                        matchUpdated = true;
                    }
                    if (matchUpdated) {
                        calendarUpdated = true;
                        console.log(`[DEBUG CO-CAPTAIN] Actualizado partido ${match.matchId} (Jornada ${match.jornada}) con nuevo co-capitán ${coCaptainUser.tag}`);
                    }
                    return match;
                });
            }
            if (calendarUpdated) {
                updates["structure.calendario"] = updatedCalendario;
                needsUpdate = true;
            }
        }

        // B. Actualizar Eliminatorias (Knockout Stages)
        if (latestTournament.structure.eliminatorias) {
            const updatedEliminatorias = { ...latestTournament.structure.eliminatorias };
            let eliminatoriasUpdated = false;

            for (const key in updatedEliminatorias) {
                if (Array.isArray(updatedEliminatorias[key])) { // Es una ronda (ej: 'final', 'semifinales', o array de partidos)
                    // Nota: 'final' puede ser objeto o array dependiendo de la implementación, pero normalmente las rondas son arrays de partidos.
                    // Si es objeto único (final), lo metemos en array para procesar igual.
                    const matches = Array.isArray(updatedEliminatorias[key]) ? updatedEliminatorias[key] : [updatedEliminatorias[key]];

                    const updatedMatches = matches.map(match => {
                        if (!match) return match;
                        let matchUpdated = false;
                        if (match.equipoA && match.equipoA.capitanId === captainId) {
                            match.equipoA.coCaptainId = coCaptainId;
                            match.equipoA.coCaptainTag = coCaptainUser.tag;
                            matchUpdated = true;
                        }
                        if (match.equipoB && match.equipoB.capitanId === captainId) {
                            match.equipoB.coCaptainId = coCaptainId;
                            match.equipoB.coCaptainTag = coCaptainUser.tag;
                            matchUpdated = true;
                        }
                        if (matchUpdated) eliminatoriasUpdated = true;
                        return match;
                    });

                    if (Array.isArray(updatedEliminatorias[key])) {
                        updatedEliminatorias[key] = updatedMatches;
                    } else {
                        updatedEliminatorias[key] = updatedMatches[0];
                    }
                }
            }

            if (eliminatoriasUpdated) {
                updates["structure.eliminatorias"] = updatedEliminatorias;
                needsUpdate = true;
                console.log(`[DEBUG CO-CAPTAIN] Actualizadas eliminatorias con nuevo co-capitán ${coCaptainUser.tag}`);
            }
        }

        // C. Actualizar Grupos (Para futuras rondas que copien datos de aquí)
        if (latestTournament.structure.grupos) {
            const updatedGrupos = { ...latestTournament.structure.grupos };
            let gruposUpdated = false;

            for (const groupName in updatedGrupos) {
                if (updatedGrupos[groupName].equipos) {
                    updatedGrupos[groupName].equipos = updatedGrupos[groupName].equipos.map(team => {
                        if (team.capitanId === captainId) {
                            team.coCaptainId = coCaptainId;
                            team.coCaptainTag = coCaptainUser.tag;
                            gruposUpdated = true;
                        }
                        return team;
                    });
                }
            }

            if (gruposUpdated) {
                updates["structure.grupos"] = updatedGrupos;
                needsUpdate = true;
                console.log(`[DEBUG CO-CAPTAIN] Actualizados grupos con nuevo co-capitán ${coCaptainUser.tag}`);
            }
        }

        if (needsUpdate) {
            await db.collection('tournaments').updateOne(
                { _id: latestTournament._id },
                { $set: updates }
            );
            console.log(`[SYNC] Co-Capitán ${coCaptainId} inyectado en todas las estructuras del torneo ${latestTournament.shortId}`);

            // 3. RETROACTIVO: Añadir al co-capitán a los hilos de partido ya creados
            const threadIds = new Set();

            // Recopilar hilos de calendario
            if (updates["structure.calendario"]) {
                for (const groupName in updates["structure.calendario"]) {
                    updates["structure.calendario"][groupName].forEach(m => {
                        if (m.threadId && (m.equipoA.capitanId === captainId || m.equipoB.capitanId === captainId)) {
                            threadIds.add(m.threadId);
                        }
                    });
                }
            }

            // Recopilar hilos de eliminatorias
            if (updates["structure.eliminatorias"]) {
                for (const key in updates["structure.eliminatorias"]) {
                    const matches = Array.isArray(updates["structure.eliminatorias"][key]) ? updates["structure.eliminatorias"][key] : [updates["structure.eliminatorias"][key]];
                    matches.forEach(m => {
                        if (m && m.threadId && (m.equipoA?.capitanId === captainId || m.equipoB?.capitanId === captainId)) {
                            threadIds.add(m.threadId);
                        }
                    });
                }
            }

            if (threadIds.size > 0) {
                console.log(`[DEBUG CO-CAPTAIN] Añadiendo retroactivamente a ${coCaptainUser.tag} a ${threadIds.size} hilos.`);
                for (const threadId of threadIds) {
                    try {
                        const thread = await client.channels.fetch(threadId).catch(() => null);
                        if (thread) {
                            await thread.members.add(coCaptainId).catch(e => console.warn(`No se pudo añadir al co-capitán al hilo ${threadId}: ${e.message}`));
                            // Mensaje de bienvenida para que se le notifique
                            await thread.send({
                                content: `👋 ¡Bienvenido al hilo, <@${coCaptainId}>! Has sido añadido como co-capitán de **${team.nombre}**.`
                            }).catch(e => console.warn(`No se pudo enviar mensaje de bienvenida al hilo ${threadId}: ${e.message}`));
                        }
                    } catch (err) {
                        console.error(`Error al procesar hilo retroactivo ${threadId}:`, err);
                    }
                }
            }
        } else {
            console.log(`[SYNC] No se encontraron estructuras para actualizar con el co-capitán ${coCaptainId}`);
        }
    }
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

    // --- INICIO LÓGICA EXTRA CAPTAINS (CLEANUP) ---
    if (teamData.extraCaptains && Array.isArray(teamData.extraCaptains)) {
        for (const extraCaptainId of teamData.extraCaptains) {
            if (/^\d+$/.test(extraCaptainId)) {
                try {
                    const chatChannel = await client.channels.fetch(tournament.discordChannelIds.chatChannelId);
                    await chatChannel.permissionOverwrites.delete(extraCaptainId, 'Equipo expulsado del torneo');
                    const matchesChannel = await client.channels.fetch(tournament.discordChannelIds.matchesChannelId);
                    await matchesChannel.permissionOverwrites.delete(extraCaptainId, 'Equipo expulsado del torneo');
                } catch (e) {
                    console.error(`No se pudieron revocar los permisos para el extraCaptain ${extraCaptainId}:`, e);
                }
            }
        }
    }
    // --- FIN LÓGICA EXTRA CAPTAINS (CLEANUP) ---

    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { [`teams.aprobados.${captainId}`]: "" } });

    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });

    try {
        const casterThread = await client.channels.fetch(updatedTournament.discordMessageIds.casterThreadId).catch(() => null);
        if (casterThread) {
            await casterThread.send(`- Equipo **${teamData.nombre}** (Capitán: ${teamData.capitanTag}) ha sido eliminado del torneo.`);
        }
    } catch (e) {
        console.warn(`No se pudo notificar la expulsión en el hilo de casters para el torneo ${tournament.shortId}`);
    }

    await updatePublicMessages(client, updatedTournament);
    await updateTournamentManagementThread(client, updatedTournament);
    await notifyTournamentVisualizer(updatedTournament);
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

        // --- DEFENSIVE CODING: Limpiar equipos null/undefined al revertir sorteo ---
        const cleanApproved = {};
        if (tournament.teams && tournament.teams.aprobados) {
            Object.entries(tournament.teams.aprobados).forEach(([key, value]) => {
                if (value && value.id) cleanApproved[key] = value;
            });
        }

        const updateQuery = {
            $set: {
                status: 'inscripcion_abierta',
                'structure.grupos': {},
                'structure.calendario': {},
                'structure.eliminatorias': { rondaActual: null },
                'teams.aprobados': cleanApproved // Guardamos versión limpia
            }
        };
        await db.collection('tournaments').updateOne({ _id: tournament._id }, updateQuery);

        const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
        await updatePublicMessages(client, updatedTournament);
        await updateTournamentManagementThread(client, updatedTournament);
        await notifyTournamentVisualizer(updatedTournament);

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
        await notifyTournamentVisualizer(finalTournamentState);
        await updateTournamentManagementThread(client, finalTournamentState);

        // --- INICIO DE LA NUEVA LÓGICA DE RECOMPENSAS ---
        if (finalTournamentState.shortId.startsWith('draft-')) {
            console.log(`[STRIKE REDUCTION] Torneo de draft finalizado. Revisando jugadores para recompensa...`);
            const draftShortId = finalTournamentState.shortId.replace('draft-', '');
            const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

            if (draft && draft.players) {
                for (const player of draft.players) {
                    const playerRecord = await db.collection('player_records').findOne({ userId: player.userId });

                    if (playerRecord && playerRecord.strikes > 0 && playerRecord.strikes < 3) {
                        await db.collection('player_records').updateOne(
                            { userId: player.userId },
                            { $inc: { strikes: -1 } }
                        );

                        if (/^\d+$/.test(player.userId)) {
                            try {
                                const user = await client.users.fetch(player.userId);
                                await user.send(`✅ **¡Recompensa por buena conducta!**\nHas completado el ciclo de draft y torneo de **${draft.name}** sin incidentes. Como recompensa, tu número de strikes se ha reducido en 1. Ahora tienes **${playerRecord.strikes - 1}** strike(s). ¡Gracias por tu deportividad!`);
                                console.log(`[STRIKE REDUCTION] Se redujo 1 strike a ${player.userName}. Nuevo total: ${playerRecord.strikes - 1}`);
                            } catch (e) {
                                console.warn(`No se pudo notificar al jugador ${player.userId} de la reducción de strikes.`);
                            }
                        }
                    }
                }
            } else {
                console.warn(`[STRIKE REDUCTION] No se encontró el draft original ${draftShortId} para aplicar la reducción de strikes.`);
            }
        }
        // --- FIN DE LA NUEVA LÓGICA DE RECOMPENSAS ---

        await cleanupTournament(client, finalTournamentState);

        if (finalTournamentState.shortId.startsWith('draft-')) {
            console.log(`[DRAFT CLEANUP] Torneo de draft detectado. Iniciando limpieza del draft asociado...`);
            const draftShortId = finalTournamentState.shortId.replace('draft-', '');
            const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

            if (draft) {
                await cleanupDraftTeamChannels(client, finalTournamentState);
                await fullCleanupDraft(client, draft);
                await db.collection('drafts').deleteOne({ _id: draft._id });
                console.log(`[DRAFT CLEANUP] El draft ${draftShortId} y todos sus recursos han sido eliminados.`);
            } else {
                console.warn(`[DRAFT CLEANUP] Se intentó limpiar el draft ${draftShortId}, pero no se encontró en la base de datos.`);
            }
        }

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
        try {
            const resource = await client.channels.fetch(resourceId).catch(() => null);
            if (resource) await resource.delete();
        }
        catch (err) {
            if (err.code !== 10003) console.error(`Fallo al borrar recurso ${resourceId}: ${err.message}`);
        }
    };

    for (const channelId of Object.values(discordChannelIds)) {
        await deleteResourceSafe(channelId);
    }
    for (const threadId of [discordMessageIds.managementThreadId, discordMessageIds.notificationsThreadId, discordMessageIds.casterThreadId]) {
        await deleteResourceSafe(threadId);
    }

    // --- INICIO DE LA CORRECCIÓN ---
    // Ahora, también borramos el mensaje de estado del canal público.
    try {
        const globalChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_STATUS);
        if (discordMessageIds.statusMessageId) {
            await globalChannel.messages.delete(discordMessageIds.statusMessageId);
        }
    } catch (e) {
        // Ignoramos el error si el mensaje ya no existe (10008)
        if (e.code !== 10008) console.error("Fallo al borrar mensaje de estado global");
    }
    // --- FIN DE LA CORRECCIÓN ---
}

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

    // --- INICIO DE LA MODIFICACIÓN CLAVE ---
    let statusChannelId;
    let statusEmbed;

    if (isDraft) {
        // Si es un draft, usamos el canal de drafts
        statusChannelId = CHANNELS.DRAFTS_STATUS;
        statusEmbed = createDraftStatusEmbed(latestState);
    } else {
        // Si es un torneo, usamos el canal de torneos
        statusChannelId = CHANNELS.TOURNAMENTS_STATUS;
        statusEmbed = createTournamentStatusEmbed(latestState);
    }

    // Actualizamos el mensaje de estado en el canal correcto
    await editMessageSafe(statusChannelId, latestState.discordMessageIds.statusMessageId, statusEmbed);

    // Las actualizaciones internas (clasificación, calendario) solo se aplican a torneos
    if (!isDraft) {
        await editMessageSafe(latestState.discordChannelIds.infoChannelId, latestState.discordMessageIds.classificationMessageId, createClassificationEmbed(latestState));
        await editMessageSafe(latestState.discordChannelIds.infoChannelId, latestState.discordMessageIds.calendarMessageId, createCalendarEmbed(latestState));
    }
    // --- FIN DE LA MODIFICACIÓN CLAVE ---
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
    await notifyTournamentVisualizer(updatedTournament);
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
            .setFooter({ text: `Torneo: ${tournament.nombre}` });
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
        .setFooter({ text: `ID del Capitán: ${userId}` });

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
            try {
                const user = await client.users.fetch(team.capitanId); await user.send({ embeds: [embed] }); notifiedCount++;
            } catch (e) { console.warn(`No se pudo notificar al capitán ${team.capitanTag}`); }
        }
    }
    return { success: true, message: `✅ Se ha enviado la notificación a ${notifiedCount} de ${approvedCaptains.length} capitanes.` };
}

export async function requestStrike(client, draft, interactorId, teamId, reportedPlayerId, reason) {
    const DISPUTE_CATEGORY_ID = '1396814712649551974'; // La categoría para los canales de disputa
    const db = getDb(); // Obtenemos acceso a la base de datos

    try {
        const guild = await client.guilds.fetch(draft.guildId);
        const reporter = draft.captains.find(c => c.userId === interactorId);
        const reported = draft.players.find(p => p.userId === reportedPlayerId);
        if (!reporter || !reported) throw new Error('No se pudo identificar al capitán o al jugador.');

        // 1. Crear el canal de texto privado para la disputa
        const channelName = `disputa-${reporter.teamName.slice(0, 15)}-${reported.psnId.slice(0, 15)}`;
        const disputeChannel = await guild.channels.create({
            name: channelName.toLowerCase().replace(/\s+/g, '-'),
            type: ChannelType.GuildText,
            parent: DISPUTE_CATEGORY_ID,
            reason: `Disputa de strike para ${reported.psnId}`,
            permissionOverwrites: [
                {
                    id: guild.id, // @everyone
                    type: 0, // ROLE
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: ARBITRO_ROLE_ID, // Rol de Árbitro/Admin
                    type: 0, // ROLE
                    allow: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: reporter.userId, // El capitán que reporta
                    type: 1, // MEMBER
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                },
                {
                    id: reportedPlayerId, // El jugador reportado
                    type: 1, // MEMBER
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                }
            ],
        });

        // 2. Crear el mensaje dentro del nuevo canal
        const embedInChannel = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('⚠️ Disputa por Strike')
            .setDescription(`El capitán **${reporter.psnId}** (<@${reporter.userId}>) ha reportado al jugador **${reported.psnId}** (<@${reportedPlayerId}>).`)
            .addFields({ name: 'Motivo del Capitán', value: reason })
            .setFooter({ text: `Draft: ${draft.name}` });

        // 3. Crear los botones con el customId CORTO (sin el motivo)
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_strike_approve:${draft.shortId}:${reportedPlayerId}:${reporter.userId}:${disputeChannel.id}`).setLabel('Aprobar Strike').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`admin_strike_reject:${draft.shortId}:${reporter.userId}:${disputeChannel.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

        // 4. Enviar el mensaje con los botones al canal de disputa
        await disputeChannel.send({
            content: `Atención <@&${ARBITRO_ROLE_ID}>, <@${reporter.userId}>, <@${reportedPlayerId}>. Se ha abierto este canal para resolver una disputa.`,
            embeds: [embedInChannel],
            components: [row]
        });

        // 5. Notificar al jugador por MD con el enlace al canal
        const reportedMember = await guild.members.fetch(reportedPlayerId).catch(() => null);
        if (reportedMember) {
            await reportedMember.send({
                content: `🚨 **Has sido reportado en el draft "${draft.name}"** 🚨\n\nTu capitán ha solicitado un strike en tu contra. Tienes la oportunidad de explicar tu versión de los hechos en el siguiente canal privado antes de que un administrador tome una decisión:\n\n${disputeChannel.toString()}`
            }).catch(e => console.warn(`No se pudo enviar MD de disputa al jugador ${reportedPlayerId}`));
        }

        // --- LÓGICA DE PERSISTENCIA PARA SOLUCIONAR EL F5 ---
        // 6. Marcamos al jugador como reportado EN LA BASE DE DATOS
        await db.collection('drafts').updateOne(
            { _id: draft._id, "players.userId": reportedPlayerId },
            { $set: { "players.$.hasBeenReportedByCaptain": true } }
        );

        // 7. Notificamos al visualizador del cambio para que la web se actualice al instante
        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        await notifyVisualizer(updatedDraft);
        // --- FIN DE LA LÓGICA DE PERSISTENCIA ---

        return { success: true };

    } catch (error) {
        console.error("Error al crear el canal de disputa por strike:", error);
        throw new Error("Hubo un error al crear el canal de disputa. Revisa los permisos de la categoría.");
    }
}

export async function requestPlayerKick(client, draft, captainId, playerIdToKick, reason) { // <-- AÑADIDO 'reason'
    const db = getDb();
    const notificationsThread = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId).catch(() => null);
    if (!notificationsThread) throw new Error("Canal de notificaciones no encontrado.");

    const captain = draft.captains.find(c => c.userId === captainId);
    const player = draft.players.find(p => p.userId === playerIdToKick);

    // SOLUCIÓN VULNERABILIDAD F5: Comprobamos si ya hay una solicitud pendiente
    if (player.kickRequestPending) {
        throw new Error("Ya existe una solicitud de expulsión pendiente para este jugador.");
    }

    // Marcamos al jugador con una solicitud pendiente EN LA BASE DE DATOS
    await db.collection('drafts').updateOne(
        { _id: draft._id, "players.userId": playerIdToKick },
        { $set: { "players.$.kickRequestPending": true } }
    );

    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🚫 Solicitud de Expulsión de Jugador')
        .setDescription(`El capitán **${captain.teamName}** ha solicitado expulsar a **${player.psnId}** de su equipo.`)
        .addFields(
            { name: 'Capitán Solicitante', value: `<@${captainId}>` },
            { name: 'Jugador a Expulsar', value: `<@${playerIdToKick}>` },
            { name: 'Motivo', value: reason } // Mostramos el motivo
        )
        .setFooter({ text: `Draft: ${draft.name}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_approve_kick:${draft.shortId}:${captainId}:${playerIdToKick}`).setLabel('Aprobar Expulsión').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`admin_reject_kick:${draft.shortId}:${captainId}:${playerIdToKick}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
    );

    await notificationsThread.send({ embeds: [embed], components: [row] });

    // Notificamos al visualizador para que el botón se desactive
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await notifyVisualizer(updatedDraft);

    return { success: true };
}

export async function handleKickApproval(client, draft, captainId, playerIdToKick, wasApproved) {
    const captain = /^\d+$/.test(captainId) ? await client.users.fetch(captainId).catch(() => null) : null;
    const player = /^\d+$/.test(playerIdToKick) ? await client.users.fetch(playerIdToKick).catch(() => null) : null;
    const playerName = draft.players.find(p => p.userId === playerIdToKick)?.psnId || 'el jugador';
    const db = getDb();

    if (wasApproved) {
        // Esta función ahora elimina al jugador por completo gracias al cambio anterior
        await forceKickPlayer(client, draft.shortId, captainId, playerIdToKick);

        // Mensaje al capitán
        if (captain) {
            await captain.send(`✅ Tu solicitud para expulsar a **${playerName}** ha sido **aprobada**. El jugador ha sido eliminado del draft.`);
        }
        // El mensaje al jugador ya se envía desde forceKickPlayer, así que no necesitamos repetirlo.
        return { success: true, message: "Expulsión aprobada. El jugador ha sido eliminado del draft." };

    } else { // Rechazado
        // Quitamos la marca de pendiente
        await db.collection('drafts').updateOne(
            { _id: draft._id, "players.userId": playerIdToKick },
            { $unset: { "players.$.kickRequestPending": "" } }
        );
        if (captain) await captain.send(`❌ Tu solicitud para expulsar a **${playerName}** ha sido **rechazada** por un administrador.`);

        // Notificamos al visualizador para que el botón se reactive
        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        await notifyVisualizer(updatedDraft);

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

    // Lógica de eliminación de canales (igual que antes)
    if (/^\d+$/.test(playerIdToKick)) {
        try {
            const teamNameFormatted = team.teamName.replace(/\s+/g, '-').toLowerCase();
            const textChannel = guild.channels.cache.find(c => c.name === `💬-${teamNameFormatted}`);
            const voiceChannel = guild.channels.cache.find(c => c.name === `🔊 ${team.teamName}`);

            if (textChannel) await textChannel.permissionOverwrites.delete(playerIdToKick, 'Jugador expulsado del draft');
            if (voiceChannel) await voiceChannel.permissionOverwrites.delete(playerIdToKick, 'Jugador expulsado del draft');
        } catch (e) {
            console.warn(`No se pudieron revocar los permisos de canal para el jugador expulsado ${playerIdToKick}: ${e.message}`);
        }
    }

    // --- ¡CAMBIO CLAVE! ---
    // Ahora eliminamos al jugador del array 'players' por completo.
    await db.collection('drafts').updateOne(
        { _id: draft._id },
        { $pull: { players: { userId: playerIdToKick } } }
    );

    // Mensaje al capitán
    if (/^\d+$/.test(teamId)) {
        try {
            const captain = await client.users.fetch(teamId);
            // Mensaje actualizado
            await captain.send(`ℹ️ Un administrador ha expulsado a **${player.psnId}** de tu equipo. El jugador ha sido **eliminado completamente del draft**.`);
        } catch (e) {
            console.warn(`No se pudo notificar al capitán ${teamId} de la expulsión forzosa.`);
        }
    }

    // Mensaje al jugador expulsado
    if (/^\d+$/.test(playerIdToKick)) {
        try {
            const kickedUser = await client.users.fetch(playerIdToKick);
            // Mensaje actualizado
            await kickedUser.send(`🚨 Has sido **expulsado del draft "${draft.name}"** por un administrador.`);
        } catch (e) {
            console.warn(`No se pudo notificar al jugador expulsado ${playerIdToKick}.`);
        }
    }

    // Actualizamos todas las interfaces
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
    await notifyVisualizer(updatedDraft);
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

    // Paso 1: Limpiamos al jugador expulsado
    await db.collection('drafts').updateOne(
        { _id: draft._id, "players.userId": kickedPlayerId },
        {
            $set: { "players.$.captainId": null },
            $unset: {
                "players.$.kickRequestPending": "",
                "players.$.hasBeenReportedByCaptain": ""
            }
        }
    );

    // Paso 2: Asignamos el nuevo jugador al equipo
    await db.collection('drafts').updateOne(
        { _id: draft._id, "players.userId": replacementPlayerId },
        { $set: { "players.$.captainId": captainId } }
    );

    // Paso 3: Damos permisos de canal al nuevo jugador
    if (/^\d+$/.test(replacementPlayerId)) {
        try {
            const teamNameFormatted = captain.teamName.replace(/\s+/g, '-').toLowerCase();
            const textChannel = guild.channels.cache.find(c => c.name === `💬-${teamNameFormatted}`);
            const voiceChannel = guild.channels.cache.find(c => c.name === `🔊 ${captain.teamName}`);

            if (textChannel) {
                await textChannel.permissionOverwrites.edit(replacementPlayerId, {
                    ViewChannel: true
                });
            }
            if (voiceChannel) {
                await voiceChannel.permissionOverwrites.edit(replacementPlayerId, {
                    ViewChannel: true,
                    Connect: true,
                    Speak: true
                });
            }
        } catch (e) {
            console.warn(`No se pudieron dar permisos de canal al jugador de reemplazo ${replacementPlayerId}: ${e.message}`);
        }
    }

    // Paso 4: Notificamos al capitán
    if (/^\d+$/.test(captainId)) {
        try {
            const captainUser = await client.users.fetch(captainId);
            await captainUser.send(`✅ **${replacementPlayer.psnId}** ha aceptado tu invitación y se ha unido a tu equipo como reemplazo.`);
        } catch (e) {
            console.warn(`No se pudo notificar al capitán ${captainId} de la aceptación del reemplazo.`);
        }
    }

    // Paso 5: Actualizamos todas las interfaces
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
    await notifyVisualizer(updatedDraft);
}
export async function requestStrikeFromWeb(client, draftId, captainId, playerId, reason) {
    try {
        const draft = await getDb().collection('drafts').findOne({ shortId: draftId });
        // --- CORRECCIÓN CLAVE ---
        // El 'teamId' en un draft es el mismo que el 'captainId'.
        const teamId = captainId;
        await requestStrike(client, draft, captainId, teamId, playerId, reason);
    } catch (error) {
        console.error(`[STRIKE WEB] Fallo en el strike del capitán ${captainId}: ${error.message}`);
        visualizerStateHandler.sendToUser(captainId, { type: 'strike_error', message: error.message });
    }
}

export async function requestKickFromWeb(client, draftId, captainId, playerId, reason) {
    try {
        const draft = await getDb().collection('drafts').findOne({ shortId: draftId });
        if (!draft) {
            throw new Error(`Draft con ID ${draftId} no encontrado.`);
        }
        // Ahora sí le pasamos el 'reason' a la función que crea el aviso
        await requestPlayerKick(client, draft, captainId, playerId, reason);

    } catch (error) {
        console.error(`[KICK WEB] Fallo en la solicitud de expulsión del capitán ${captainId}: ${error.message}`);
        // Enviamos el error de vuelta a la web para que el capitán sepa que algo falló
        visualizerStateHandler.sendToUser(captainId, { type: 'kick_error', message: error.message });
    }
}

export async function requestSubstituteFromWeb(client, draftId, captainId, outPlayerId, inPlayerId, reason) {
    // EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle ya importados arriba via ESM
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftId });
    if (!draft) throw new Error('Draft no encontrado');

    const captain = draft.captains.find(c => c.userId === captainId);
    const outPlayer = draft.players.find(p => p.userId === outPlayerId);
    const inPlayer = draft.players.find(p => p.userId === inPlayerId);

    if (!captain || !outPlayer || !inPlayer) throw new Error('Datos de jugador o capitán inválidos');

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channelId = draft.discordMessageIds?.casterTextChannelId || process.env.INFO_CHANNEL_ID;
    const adminChannel = await guild.channels.fetch(channelId).catch(() => null);

    if (!adminChannel) throw new Error('No se encontró el canal de administración del draft para enviar la solicitud.');

    const embed = new EmbedBuilder()
        .setTitle('🔄 Solicitud de Sustitución (Web)')
        .setColor('#2196F3')
        .addFields(
            { name: 'Capitán', value: `<@${captain.userId}> (${captain.userName})`, inline: true },
            { name: 'Equipo', value: captain.teamName, inline: true },
            { name: '\u200B', value: '\u200B' }, // spacer
            { name: 'Jugador Saliente', value: `<@${outPlayer.userId}> (${outPlayer.userName})`, inline: true },
            { name: 'Agente Libre Entrante', value: `<@${inPlayer.userId}> (${inPlayer.userName})`, inline: true },
            { name: 'Motivo', value: reason || 'N/A' }
        );

    // Limitamos la custom_id debido a reglas de Discord (max 100 char)
    // "subreq_app:" + draftShortId(8) + ":" + capId(19) + ":" + outId(19) + ":" + inId(19) = OK
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`subreq_app:${draft.shortId}:${captainId}:${outPlayerId}:${inPlayerId}`)
            .setLabel('Aprobar')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`subreq_rej:${draft.shortId}:${captainId}:${outPlayerId}:${inPlayerId}`)
            .setLabel('Denegar')
            .setStyle(ButtonStyle.Danger)
    );

    await adminChannel.send({ embeds: [embed], components: [row] });
}

// Y AÑADE ESTA FUNCIÓN EXTRA PARA PODER USARLA DESDE OTROS ARCHIVOS
export async function getVerifiedPlayer(userId) {
    return await checkVerification(userId);
}
export async function prepareRouletteDraw(client, draftShortId) {
    await setBotBusy(true);
    const db = getDb();
    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    try {
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft || draft.status !== 'finalizado') {
            throw new Error('Este draft no ha finalizado o no existe.');
        }

        // --- INICIO DE LA LÓGICA DE DRAFT DINÁMICA ---
        const captainCount = draft.captains.length;
        const tournamentName = `Torneo Draft - ${draft.name}`;
        const tournamentShortId = `draft-${draft.shortId}`;

        // Seleccionamos el formato según la cantidad de equipos
        let formatId = '8_teams_semis_classic';
        if (captainCount === 16) {
            formatId = '16_teams_quarters_new';
        }

        const format = TOURNAMENT_FORMATS[formatId];
        const config = {
            formatId, format, isPaid: draft.config.isPaid, matchType: 'ida',
            entryFee: draft.config.entryFee, prizeCampeon: draft.config.prizeCampeon, prizeFinalista: draft.config.prizeFinalista,
        };

        // Creamos la estructura del torneo en la base de datos pero con equipos y grupos vacíos.
        const newTournament = await createNewTournament(client, guild, tournamentName, tournamentShortId, config);
        if (!newTournament.success) {
            throw new Error(newTournament.message || "No se pudo crear la estructura del torneo.");
        }

        // Creamos los grupos vacíos basándonos en el formato elegido
        const initialGroups = {};
        for (let i = 0; i < format.groups; i++) {
            const groupName = `Grupo ${String.fromCharCode(65 + i)}`; // Grupo A, Grupo B, Grupo C...
            initialGroups[groupName] = { equipos: [] };
        }

        await db.collection('tournaments').updateOne(
            { _id: newTournament.tournament._id },
            { $set: { 'structure.grupos': initialGroups, status: 'sorteo_en_curso' } }
        );
        // --- FIN DE LA LÓGICA DINÁMICA ---


        const sessionId = `roulette_${tournamentShortId}_${Math.random().toString(36).substring(2, 8)}`;
        const teamsToDraw = draft.captains.map(c => ({ id: c.userId, name: c.teamName, logoUrl: c.logoUrl || null }));

        await db.collection('roulette_sessions').insertOne({
            sessionId: sessionId,
            tournamentShortId: newTournament.tournament.shortId, // Guardamos el shortId
            teams: teamsToDraw,
            drawnTeams: [],
            status: 'pending'
        });

        await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $set: { status: 'sorteo_ruleta_pendiente' } }
        );

        const rouletteUrl = `${process.env.BASE_URL}/?rouletteSessionId=${sessionId}`;
        const casterChannelId = draft.discordMessageIds.casterTextChannelId;

        if (casterChannelId) {
            const casterChannel = await client.channels.fetch(casterChannelId);
            const embed = new EmbedBuilder()
                .setColor('#e62429')
                .setTitle('🎡 Enlace para el Sorteo con Ruleta')
                .setDescription('¡Aquí tenéis el enlace exclusivo para realizar el sorteo del torneo en directo! Abridlo en un navegador para capturarlo en OBS.')
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Abrir Ruleta del Sorteo').setStyle(ButtonStyle.Link).setURL(rouletteUrl).setEmoji('🔗')
            );
            await casterChannel.send({ embeds: [embed], components: [row] });
        } else {
            throw new Error('No se ha configurado un canal para casters en este draft.');
        }

        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        await updateDraftManagementPanel(client, updatedDraft);

    } finally {
        await setBotBusy(false);
    }
}
export async function handleRouletteSpinResult(client, sessionId, teamId) {
    const db = getDb();
    const session = await db.collection('roulette_sessions').findOne({ sessionId });
    if (!session || session.status !== 'pending') return;

    if (session.drawnTeams.includes(teamId)) {
        console.warn(`[ROULETTE] Se intentó volver a sortear al equipo ${teamId} en la sesión ${sessionId}`);
        return;
    }

    const tournament = await db.collection('tournaments').findOne({ shortId: session.tournamentShortId });
    if (!tournament) return;

    let nextGroup;
    const totalTeams = session.teams.length;
    const drawnCount = session.drawnTeams.length;

    if (totalTeams <= 8) { // Mantiene la lógica para 8 o menos equipos
        nextGroup = drawnCount % 2 === 0 ? 'A' : 'B';
    } else { // Nueva lógica para más de 8 equipos (ej. 16)
        const groupLetters = ['A', 'B', 'C', 'D'];
        nextGroup = groupLetters[drawnCount % 4];
    }
    const groupName = `Grupo ${nextGroup}`;

    const draft = await db.collection('drafts').findOne({ shortId: tournament.shortId.replace('draft-', '') });
    const captainData = draft.captains.find(c => c.userId === teamId);

    const teamObject = {
        id: captainData.userId, nombre: captainData.teamName, capitanId: captainData.userId,
        logoUrl: captainData.logoUrl, eafcTeamName: captainData.eafcTeamName,
        stats: { pj: 0, pts: 0, gf: 0, gc: 0, dg: 0 }
    };

    await db.collection('tournaments').updateOne(
        { _id: tournament._id },
        { $push: { [`structure.grupos.${groupName}.equipos`]: teamObject }, $set: { [`teams.aprobados.${teamId}`]: teamObject } }
    );
    await db.collection('roulette_sessions').updateOne(
        { _id: session._id },
        { $push: { drawnTeams: teamId } }
    );

    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    await updatePublicMessages(client, updatedTournament);
    await notifyTournamentVisualizer(updatedTournament);

    const newSessionState = await db.collection('roulette_sessions').findOne({ _id: session._id });
    if (newSessionState.drawnTeams.length === newSessionState.teams.length) {
        console.log(`[ROULETTE] Sorteo finalizado para el torneo ${tournament.shortId}.`);
        await db.collection('roulette_sessions').updateOne({ _id: session._id }, { $set: { status: 'completed' } });
        await finalizeRouletteDrawAndStartMatches(client, tournament._id);
    }
}

async function finalizeRouletteDrawAndStartMatches(client, tournamentId) {
    const db = getDb();
    const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
    const guild = await client.guilds.fetch(tournament.guildId);

    // --- INICIO DEL BLOQUE AÑADIDO: CREACIÓN DE CANALES DE EQUIPO ---
    const teamCategory = await guild.channels.fetch(TEAM_CHANNELS_CATEGORY_ID).catch(() => null);
    const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID);
    const draft = await db.collection('drafts').findOne({ shortId: tournament.shortId.replace('draft-', '') });

    if (teamCategory && arbitroRole && draft) {
        console.log(`[CHANNELS] Creando canales de equipo para el torneo ${tournament.shortId}`);
        for (const team of Object.values(tournament.teams.aprobados)) {
            // Buscamos la plantilla completa del equipo en el draft original
            const teamPlayers = draft.players.filter(p => p.captainId === team.capitanId);
            const realPlayerIds = teamPlayers.map(p => p.userId).filter(id => /^\d+$/.test(id));

            const voicePermissions = [
                { id: arbitroRole.id, allow: [PermissionsBitField.Flags.ViewChannel] }
            ];

            // Permisos de moderador para el capitán
            if (/^\d+$/.test(team.capitanId)) {
                voicePermissions.push({
                    id: team.capitanId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.Speak,
                        PermissionsBitField.Flags.MuteMembers,
                        PermissionsBitField.Flags.DeafenMembers,
                        PermissionsBitField.Flags.MoveMembers
                    ]
                });
            }

            await guild.channels.create({
                name: `🔊 ${team.nombre}`,
                type: ChannelType.GuildVoice,
                parent: teamCategory,
                permissionOverwrites: voicePermissions
            });
        }
    } else {
        console.warn(`[CHANNELS] No se pudo crear canales de equipo para ${tournament.shortId} por falta de categoría, rol o datos del draft.`);
    }
    // --- FIN DEL BLOQUE AÑADIDO ---

    const calendario = {};
    for (const nombreGrupo in tournament.structure.grupos) {
        const equiposGrupo = tournament.structure.grupos[nombreGrupo].equipos;
        calendario[nombreGrupo] = [];
        if (equiposGrupo.length === 4) {
            const [t1, t2, t3, t4] = equiposGrupo;
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 1, t1, t4), createMatchObject(nombreGrupo, 1, t2, t3));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 2, t1, t3), createMatchObject(nombreGrupo, 2, t4, t2));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 3, t1, t2), createMatchObject(nombreGrupo, 3, t3, t4));
        }
    }

    for (const partido of Object.values(calendario).flat().filter(p => p.jornada === 1)) {
        const fieldPath = `structure.calendario.${partido.nombreGrupo}.${calendario[partido.nombreGrupo].findIndex(m => m.matchId === partido.matchId)}`;

        // Bloqueo atómico
        const result = await db.collection('tournaments').findOneAndUpdate(
            {
                _id: tournament._id,
                [`${fieldPath}.threadId`]: null,
                [`${fieldPath}.status`]: { $ne: 'en_curso' }
            },
            { $set: { [`${fieldPath}.status`]: 'creando_hilo', [`${fieldPath}.lockedAt`]: new Date() } },
            { returnDocument: 'after' }
        );

        if (!result) continue;

        try {
            const threadId = await createMatchThread(client, guild, partido, tournament.discordChannelIds.matchesChannelId, tournament.shortId);
            if (threadId) {
                partido.threadId = threadId;
                partido.status = 'en_curso';
            } else {
                partido.status = 'pendiente';
            }
        } catch (error) {
            console.error(`[ERROR] Fallo al crear hilo en finalizeRoulette para ${partido.matchId}:`, error);
            partido.status = 'pendiente';
        }
        // Pausa entre creaciones de hilos para evitar rate limit de Discord
        await new Promise(r => setTimeout(r, 1500));
    }

    await db.collection('tournaments').updateOne(
        { _id: tournament._id },
        { $set: { 'structure.calendario': calendario, status: 'fase_de_grupos' } }
    );

    const finalTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    await updatePublicMessages(client, finalTournament);
    await updateTournamentManagementThread(client, finalTournament);
    await notifyTournamentVisualizer(finalTournament);
}
async function generateGroupBasedSchedule(tournament, preserveGroups = false) {
    const db = getDb();
    tournament.status = 'fase_de_grupos';
    const format = tournament.config.format;

    let grupos = {};

    if (preserveGroups && tournament.structure.grupos) {
        console.log(`[DEBUG] Regenerando calendario conservando grupos existentes para ${tournament.shortId}`);
        grupos = tournament.structure.grupos;
    } else {
        let teams = Object.values(tournament.teams.aprobados);
        teams.sort(() => Math.random() - 0.5);

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
    }

    const calendario = {};
    for (const nombreGrupo in grupos) {
        calendario[nombreGrupo] = [];
        const equiposGrupo = grupos[nombreGrupo].equipos;
        if (equiposGrupo.length === 4) {
            const [t1, t2, t3, t4] = equiposGrupo;
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 1, t1, t4), createMatchObject(nombreGrupo, 1, t2, t3));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 2, t1, t3), createMatchObject(nombreGrupo, 2, t4, t2));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 3, t1, t2), createMatchObject(nombreGrupo, 3, t3, t4));
            if (tournament.config.matchType === 'idavuelta') {
                calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 4, t4, t1), createMatchObject(nombreGrupo, 4, t3, t2));
                calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 5, t3, t1), createMatchObject(nombreGrupo, 5, t2, t4));
                calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 6, t2, t1), createMatchObject(nombreGrupo, 6, t4, t3));
            }
        }
    }
    tournament.structure.calendario = calendario;
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: tournament });
}

async function generateFlexibleLeagueSchedule(tournament, preserveGroups = false) {
    const db = getDb();
    console.log(`[DEBUG LIGA] 1. Iniciando calendario LIGA para ${tournament.shortId}`);
    tournament.status = 'fase_de_grupos';

    let teams;

    if (preserveGroups && tournament.structure.grupos && tournament.structure.grupos['Liga']) {
        console.log(`[DEBUG LIGA] Conservando equipos de Liga existentes.`);
        teams = tournament.structure.grupos['Liga'].equipos;
    } else {
        // --- DEFENSIVE CODING: Filtrar equipos null/undefined para evitar crashes ---
        teams = Object.values(tournament.teams.aprobados || {}).filter(t => t && t.id);
        const originalCount = Object.keys(tournament.teams.aprobados || {}).length;
        if (teams.length < originalCount) {
            console.warn(`[WARNING] Se filtraron ${originalCount - teams.length} equipos inválidos (null/undefined) en generateFlexibleLeagueSchedule.`);
        }

        // Mezclar equipos aleatoriamente al inicio para evitar sesgos por orden de inscripción
        teams.sort(() => Math.random() - 0.5);

        // Inicializar stats
        teams.forEach(team => {
            team.stats = { pj: 0, pts: 0, gf: 0, gc: 0, dg: 0, buchholz: 0 }; // Añadido buchholz
        });
    }

    // Si es modo SWISS (Custom Rounds), solo generamos la Ronda 1
    if (tournament.config.leagueMode === 'custom_rounds') {
        console.log(`[SWISS] Iniciando Sistema Suizo para ${tournament.shortId}. Generando Ronda 1.`);

        tournament.structure.grupos['Liga'] = { equipos: teams }; // Guardamos todos (sin ghost aún)
        tournament.structure.calendario['Liga'] = [];
        tournament.currentRound = 1;

        // Generar Ronda 1 (Aleatoria)
        // Si es impar, uno descansa (Ghost)
        let roundTeams = [...teams];
        if (roundTeams.length % 2 !== 0) {
            // En la ronda 1, el descanso es aleatorio (el último tras el shuffle)
            const byeTeam = roundTeams.pop();
            console.log(`[SWISS] Equipo con BYE en Ronda 1: ${byeTeam.nombre}`);
            // Creamos el partido "fantasma" para el historial
            const ghostMatch = createMatchObject('Liga', 1, byeTeam, { id: 'ghost', nombre: 'DESCANSO', capitanId: 'ghost' });
            ghostMatch.status = 'finalizado';
            ghostMatch.resultado = '1-0';

            // Actualizar stats del equipo que descansa
            byeTeam.stats.pj += 1;
            byeTeam.stats.pts += 3;
            byeTeam.stats.gf += 1;
            byeTeam.stats.dg += 1;

            tournament.structure.calendario['Liga'].push(ghostMatch);
        }

        // Emparejar el resto (0-1, 2-3, etc.)
        for (let i = 0; i < roundTeams.length; i += 2) {
            const t1 = roundTeams[i];
            const t2 = roundTeams[i + 1];
            tournament.structure.calendario['Liga'].push(createMatchObject('Liga', 1, t1, t2));
        }

        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: tournament });
        console.log(`[SWISS] Ronda 1 generada.`);
        return;
    }

    // --- MODO ALL VS ALL (Round Robin Completo) ---
    // Si es impar, añadimos el equipo fantasma (Descanso) PARA EL ALGORITMO DE POLÍGONO
    // NOTA: Si preserveGroups es true, el ghostTeam ya podría estar en la lista si se guardó.
    // Pero en la estructura de grupos NO guardamos al ghost.
    // Así que siempre hay que recalcular si hace falta ghost para el algoritmo.

    if (teams.length % 2 !== 0) {
        const ghostTeam = { id: 'ghost', nombre: 'DESCANSO', capitanId: 'ghost', stats: {} };
        teams.push(ghostTeam);
    }

    const numTeams = teams.length;

    if (!preserveGroups) {
        tournament.structure.grupos['Liga'] = { equipos: teams.filter(t => t.id !== 'ghost') };
    }
    tournament.structure.calendario['Liga'] = [];

    let totalRoundsToGenerate = numTeams - 1;
    if (tournament.config.matchType === 'idavuelta') {
        totalRoundsToGenerate = totalRoundsToGenerate * 2;
    }

    // --- LÓGICA PARA LIGUILLA CUSTOM (RONDAS LIMITADAS) ---
    if (tournament.config.leagueMode === 'round_robin_custom' && tournament.config.customRounds) {
        const limit = parseInt(tournament.config.customRounds);
        if (limit < totalRoundsToGenerate) {
            console.log(`[LIGA CUSTOM] Limitando calendario a ${limit} rondas (de ${totalRoundsToGenerate} posibles).`);
            totalRoundsToGenerate = limit;
        }
    }
    // ------------------------------------------------------

    // Algoritmo Round Robin (Rotación de polígono)
    let rotatingTeams = [...teams];
    rotatingTeams.shift(); // Sacamos al primer equipo (pivote fijo)
    const baseRounds = numTeams - 1;

    for (let round = 0; round < totalRoundsToGenerate; round++) {
        const jornadaNum = round + 1;
        const isSecondLeg = round >= baseRounds;

        const teamA = teams[0];
        const teamB = rotatingTeams[0];

        let home, away;
        if (isSecondLeg) {
            if (round % 2 === 0) { home = teamB; away = teamA; } else { home = teamA; away = teamB; }
        } else {
            if (round % 2 === 0) { home = teamA; away = teamB; } else { home = teamB; away = teamA; }
        }

        tournament.structure.calendario['Liga'].push(createMatchObject('Liga', jornadaNum, home, away));

        for (let i = 1; i < numTeams / 2; i++) {
            const teamC = rotatingTeams[i];
            const teamD = rotatingTeams[numTeams - 1 - i];

            if (isSecondLeg) {
                tournament.structure.calendario['Liga'].push(createMatchObject('Liga', jornadaNum, teamD, teamC));
            } else {
                tournament.structure.calendario['Liga'].push(createMatchObject('Liga', jornadaNum, teamC, teamD));
            }
        }
        rotatingTeams.push(rotatingTeams.shift());
    }

    // Gestionar partidos contra "ghost" (Descanso)
    for (const match of tournament.structure.calendario['Liga']) {
        if (match.equipoA.id === 'ghost' || match.equipoB.id === 'ghost') {
            match.status = 'finalizado';
            match.matchId = 'ghost';

            const realTeamIsA = match.equipoA.id !== 'ghost';
            match.resultado = realTeamIsA ? '1-0' : '0-1';

            const realTeam = realTeamIsA ? match.equipoA : match.equipoB;
            const groupTeam = tournament.structure.grupos['Liga'].equipos.find(t => t.id === realTeam.id);
            if (groupTeam) {
                groupTeam.stats.pj += 1;
                groupTeam.stats.pts += 3;
                groupTeam.stats.gf += 1;
                groupTeam.stats.dg += 1;
            }
        }
    }

    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: tournament });
    console.log(`[DEBUG LIGA] Calendario Round Robin guardado.`);
}

// =====================================================================
// === LÓGICA DE PROGRESIÓN DEL TORNEO (Copiar al final del archivo) ===
// =====================================================================

export async function checkForGroupStageAdvancement(client, guild, tournament) {
    const allGroupMatches = Object.values(tournament.structure.calendario).flat();

    if (allGroupMatches.length === 0 || tournament.status !== 'fase_de_grupos') return;

    const allFinished = allGroupMatches.every(p => p.status === 'finalizado');

    if (allFinished) {
        // --- BLOQUEO ATÓMICO PARA EVITAR DOBLE AVANCE ---
        const db = getDb();
        const lockResult = await db.collection('tournaments').updateOne(
            { _id: tournament._id, status: 'fase_de_grupos', advancementLock: { $ne: true } },
            { $set: { advancementLock: true } }
        );

        if (lockResult.modifiedCount === 0) {
            console.log(`[ADVANCEMENT] Avance ya en curso para ${tournament.shortId}.`);
            return;
        }

        try {
            console.log(`[ADVANCEMENT] Todos los partidos actuales finalizados para ${tournament.shortId}.`);

            // --- LÓGICA SWISS SYSTEM ---
            if (tournament.config.formatId === 'flexible_league' && tournament.config.leagueMode === 'custom_rounds') {
                const totalRounds = parseInt(tournament.config.customRounds) || 3;
                const currentRound = tournament.currentRound || 1;

                if (currentRound < totalRounds) {
                    console.log(`[SWISS] Avanzando a la Ronda ${currentRound + 1} de ${totalRounds}`);
                    await generateNextSwissRound(client, guild, tournament);

                    // Liberar bloqueo después de generar la siguiente ronda
                    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { advancementLock: "" } });
                    return;
                } else {
                    // RECALCULAR BUCHHOLZ FINAL ANTES DE PASAR A ELIMINATORIAS
                    console.log(`[SWISS] Recalculando Buchholz final para ${tournament.shortId}...`);
                    const teams = tournament.structure.grupos['Liga'].equipos;
                    const allMatches = tournament.structure.calendario['Liga'];
                    calculateBuchholz(teams, allMatches);

                    // Guardar los stats actualizados
                    await db.collection('tournaments').updateOne(
                        { _id: tournament._id },
                        { $set: { "structure.grupos.Liga.equipos": teams } }
                    );
                }
            }
            // ---------------------------

            console.log(`[ADVANCEMENT] Fase de liguilla/grupos COMPLETADA para ${tournament.shortId}. Iniciando siguiente fase.`);

            postTournamentUpdate('GROUP_STAGE_END', tournament).catch(console.error);
            await startNextKnockoutRound(client, guild, tournament);

            const finalTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
            await updatePublicMessages(client, finalTournamentState);
            await updateTournamentManagementThread(client, finalTournamentState);
            await notifyTournamentVisualizer(finalTournamentState);

            // Liberar bloqueo al final
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { advancementLock: "" } });

        } catch (error) {
            console.error(`[ADVANCEMENT ERROR] Error en el avance de fase:`, error);
            // Liberar bloqueo en caso de error para permitir reintento
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { advancementLock: "" } });
        }
    }
}

async function generateNextSwissRound(client, guild, tournament) {
    const db = getDb();
    const nextRound = (tournament.currentRound || 0) + 1;
    const teams = tournament.structure.grupos['Liga'].equipos;
    const allMatches = tournament.structure.calendario['Liga'];

    // 1. Calcular Buchholz y Ordenar
    calculateBuchholz(teams, allMatches);

    // Ordenar: Puntos > Buchholz > DG > GF
    teams.sort((a, b) => {
        if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
        if (a.stats.buchholz !== b.stats.buchholz) return b.stats.buchholz - a.stats.buchholz;
        if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
        return b.stats.gf - a.stats.gf;
    });

    // 2. Emparejamiento (Pairing)
    let availableTeams = [...teams];
    const newMatches = [];

    // Gestión de BYE (Descanso) si es impar
    if (availableTeams.length % 2 !== 0) {
        // El descanso se lo lleva el PEOR clasificado que NO haya descansado aún
        let byeCandidateIndex = availableTeams.length - 1;
        while (byeCandidateIndex >= 0) {
            const candidate = availableTeams[byeCandidateIndex];
            const hasRested = allMatches.some(m =>
                (m.equipoA.id === candidate.id && m.equipoB.id === 'ghost') ||
                (m.equipoB.id === candidate.id && m.equipoA.id === 'ghost')
            );

            if (!hasRested) {
                // Encontrado
                const byeTeam = availableTeams.splice(byeCandidateIndex, 1)[0];
                console.log(`[SWISS] Ronda ${nextRound}: BYE para ${byeTeam.nombre}`);

                const ghostMatch = createMatchObject('Liga', nextRound, byeTeam, { id: 'ghost', nombre: 'DESCANSO', capitanId: 'ghost' });
                ghostMatch.status = 'finalizado';
                ghostMatch.resultado = '1-0';

                // Actualizar stats
                const teamInDb = teams.find(t => t.id === byeTeam.id);
                teamInDb.stats.pj += 1;
                teamInDb.stats.pts += 3;
                teamInDb.stats.gf += 1;
                teamInDb.stats.dg += 1;

                newMatches.push(ghostMatch);
                break;
            }
            byeCandidateIndex--;
        }
        // Si todos descansaron (raro en swiss corto), le toca al último otra vez
        if (byeCandidateIndex < 0) {
            const byeTeam = availableTeams.pop();
            const ghostMatch = createMatchObject('Liga', nextRound, byeTeam, { id: 'ghost', nombre: 'DESCANSO', capitanId: 'ghost' });
            ghostMatch.status = 'finalizado';
            ghostMatch.resultado = '1-0';
            // Actualizar stats
            const teamInDb = teams.find(t => t.id === byeTeam.id);
            teamInDb.stats.pj += 1; teamInDb.stats.pts += 3; teamInDb.stats.gf += 1; teamInDb.stats.dg += 1;
            newMatches.push(ghostMatch);
        }
    }

    // Emparejar el resto: Búsqueda con Retroceso (Backtracking) para evitar rematches
    function findPairings(teamsLeft, currentMatches) {
        if (teamsLeft.length === 0) return currentMatches;

        const teamA = teamsLeft[0];
        for (let i = 1; i < teamsLeft.length; i++) {
            const teamB = teamsLeft[i];

            // Verificar si ya jugaron
            const alreadyPlayed = allMatches.some(m =>
                (m.equipoA.id === teamA.id && m.equipoB.id === teamB.id) ||
                (m.equipoA.id === teamB.id && m.equipoB.id === teamA.id)
            );

            if (!alreadyPlayed) {
                const remaining = teamsLeft.filter((_, idx) => idx !== 0 && idx !== i);
                const result = findPairings(remaining, [...currentMatches, createMatchObject('Liga', nextRound, teamA, teamB)]);
                if (result) return result;
            }
        }
        return null; // No se encontró combinación válida sin repetir
    }

    const optimalMatches = findPairings(availableTeams, []);

    if (optimalMatches) {
        newMatches.push(...optimalMatches);
    } else {
        // Fallback crítico: Si no hay solución matemática sin repetir, usamos el greedy antiguo
        console.warn(`[SWISS] No se encontró una combinación perfecta sin rematches para la Ronda ${nextRound}. Usando fallback.`);
        let fallbackTeams = [...availableTeams];
        while (fallbackTeams.length > 0) {
            const teamA = fallbackTeams.shift();
            let opponentIndex = 0;
            let found = false;

            while (opponentIndex < fallbackTeams.length) {
                const teamB = fallbackTeams[opponentIndex];
                const alreadyPlayed = allMatches.some(m =>
                    (m.equipoA.id === teamA.id && m.equipoB.id === teamB.id) ||
                    (m.equipoA.id === teamB.id && m.equipoB.id === teamA.id)
                );

                if (!alreadyPlayed) {
                    fallbackTeams.splice(opponentIndex, 1);
                    newMatches.push(createMatchObject('Liga', nextRound, teamA, teamB));
                    found = true;
                    break;
                }
                opponentIndex++;
            }

            if (!found && fallbackTeams.length > 0) {
                const teamB = fallbackTeams.shift();
                newMatches.push(createMatchObject('Liga', nextRound, teamA, teamB));
            }
        }
    }

    // 3. VALIDAR partidos antes de guardar (evitar corruptos)
    const validMatches = newMatches.filter(m => {
        const isValid = m.equipoA?.nombre && m.equipoB?.nombre && m.equipoA?.id && m.equipoB?.id;
        if (!isValid) {
            console.error(`[SWISS VALIDATION] Partido corrupto detectado y descartado:`, m);
        }
        return isValid;
    });

    if (validMatches.length !== newMatches.length) {
        console.error(`[SWISS CRITICAL] ${newMatches.length - validMatches.length} partidos corruptos fueron descartados antes de guardar.`);
    }

    // Guardar y Notificar
    tournament.structure.calendario['Liga'].push(...validMatches);
    tournament.currentRound = nextRound;

    // Actualizar stats de equipos en DB (por el Buchholz y Byes)
    tournament.structure.grupos['Liga'].equipos = teams;

    await db.collection('tournaments').updateOne(
        { _id: tournament._id },
        {
            $set: {
                "structure.calendario.Liga": tournament.structure.calendario['Liga'],
                "structure.grupos.Liga.equipos": teams,
                "currentRound": nextRound
            }
        }
    );

    // 4. Crear Hilos para los nuevos partidos - BLOQUEO ROBUSTO POR MATCHID
    const infoChannel = await client.channels.fetch(tournament.discordChannelIds.infoChannelId).catch(() => null);
    const embedAnuncio = new EmbedBuilder().setColor('#3498db').setTitle(`📢 ¡Comienza la Jornada ${nextRound}!`).setDescription('Los emparejamientos se han generado basados en la clasificación actual (Sistema Suizo).');

    console.log(`[SWISS] Creando hilos para ${validMatches.length} partidos...`);

    for (const match of validMatches) {
        if (match.equipoB?.id === 'ghost') continue; // Saltar BYEs

        // BLOQUEO ATÓMICO MEJORADO: Buscar por matchI en lugar de índice
        const result = await db.collection('tournaments').findOneAndUpdate(
            {
                _id: tournament._id,
                'structure.calendario.Liga': {
                    $elemMatch: {
                        matchId: match.matchId,
                        threadId: null,  // Solo si NO tiene hilo aún
                        status: { $ne: 'creando_hilo' }  // No si ya está bloqueado
                    }
                }
            },
            {
                $set: {
                    'structure.calendario.Liga.$.status': 'creando_hilo',
                    'structure.calendario.Liga.$.lockedAt': new Date()
                }
            },
            { returnDocument: 'after' }
        );

        if (!result) {
            console.log(`[SWISS] El hilo para ${match.matchId} ya existe o está siendo creado. Saltando.`);
            continue;
        }

        try {
            const threadId = await createMatchThread(client, guild, match, tournament.discordChannelIds.matchesChannelId, tournament.shortId);

            if (threadId) {
                // Actualizar con threadId
                await db.collection('tournaments').updateOne(
                    {
                        _id: tournament._id,
                        'structure.calendario.Liga.matchId': match.matchId
                    },
                    {
                        $set: {
                            'structure.calendario.Liga.$.threadId': threadId,
                            'structure.calendario.Liga.$.status': 'en_curso'
                        }
                    }
                );
                console.log(`[SWISS] Hilo creado exitosamente para ${match.matchId}: ${threadId}`);
                embedAnuncio.addFields({ name: `Partido`, value: `> ${match.equipoA.nombre} vs ${match.equipoB.nombre}` });
            } else {
                // Revertir estado si falla la creación
                console.warn(`[SWISS] createMatchThread devolvió null para ${match.matchId}. Revirtiendo estado.`);
                await db.collection('tournaments').updateOne(
                    {
                        _id: tournament._id,
                        'structure.calendario.Liga.matchId': match.matchId
                    },
                    {
                        $set: {
                            'structure.calendario.Liga.$.status': 'pendiente'
                        }
                    }
                );
            }
        } catch (error) {
            console.error(`[ERROR] Fallo al crear hilo SWISS para ${match.matchId}:`, error);
            // Revertir estado para que pueda reintentarse
            await db.collection('tournaments').updateOne(
                {
                    _id: tournament._id,
                    'structure.calendario.Liga.matchId': match.matchId
                },
                {
                    $set: {
                        'structure.calendario.Liga.$.status': 'pendiente'
                    }
                }
            ).catch(e => console.error(`[ERROR] Fallo al revertir estado:`, e));
        }
        // Pausa entre creaciones de hilos para evitar rate limit de Discord
        await new Promise(r => setTimeout(r, 1500));
    }

    if (infoChannel) await infoChannel.send({ embeds: [embedAnuncio] });

    const finalTournamentState = await db.collection('tournaments').findOne({ _id: tournament._id });
    await updatePublicMessages(client, finalTournamentState);
    await updateTournamentManagementThread(client, finalTournamentState);
    await notifyTournamentVisualizer(finalTournamentState);
}

function calculateBuchholz(teams, allMatches) {
    for (const team of teams) {
        let buchholz = 0;
        const playedMatches = allMatches.filter(m =>
            (m.equipoA.id === team.id || m.equipoB.id === team.id) && m.status === 'finalizado'
        );

        for (const match of playedMatches) {
            const rivalId = match.equipoA.id === team.id ? match.equipoB.id : match.equipoA.id;
            if (rivalId === 'ghost') continue;
            const rival = teams.find(t => t.id === rivalId);
            if (rival) buchholz += rival.stats.pts;
        }
        team.stats.buchholz = buchholz;
    }
}

export async function checkForKnockoutAdvancement(client, guild, tournament) {
    const rondaActual = tournament.structure.eliminatorias.rondaActual;
    if (!rondaActual) return;

    if (rondaActual === 'final') {
        const finalMatch = tournament.structure.eliminatorias.final;
        if (finalMatch && finalMatch.status === 'finalizado') {
            await handleFinalResult(client, guild, tournament);
        }
        return;
    }

    const partidosRonda = tournament.structure.eliminatorias[rondaActual];
    const allFinished = partidosRonda && partidosRonda.every(p => p && p.status === 'finalizado');

    if (allFinished) {
        // --- BLOQUEO ATÓMICO PARA EVITAR DOBLE AVANCE ---
        const db = getDb();
        const lockResult = await db.collection('tournaments').updateOne(
            { _id: tournament._id, status: tournament.status, advancementLock: { $ne: true } },
            { $set: { advancementLock: true } }
        );

        if (lockResult.modifiedCount === 0) {
            console.log(`[ADVANCEMENT] Avance eliminatorio ya en curso para ${tournament.shortId}.`);
            return;
        }

        try {
            console.log(`[ADVANCEMENT] Ronda eliminatoria '${rondaActual}' finalizada para ${tournament.shortId}.`);
            postTournamentUpdate('KNOCKOUT_ROUND_COMPLETE', { matches: partidosRonda, stage: rondaActual, tournament }).catch(console.error);
            await startNextKnockoutRound(client, guild, tournament);

            // Liberar bloqueo al final
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { advancementLock: "" } });
        } catch (error) {
            console.error(`[ADVANCEMENT ERROR] Error en el avance de fase eliminatoria:`, error);
            // Liberar bloqueo en caso de error
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { advancementLock: "" } });
        }
    }
}

export async function startNextKnockoutRound(client, guild, tournament) {
    const db = getDb();
    let currentTournament = await db.collection('tournaments').findOne({ _id: tournament._id });

    const format = currentTournament.config.format;
    const rondaActual = currentTournament.structure.eliminatorias.rondaActual;

    let siguienteRondaKey;

    if (rondaActual) {
        const indiceRondaActual = format.knockoutStages.indexOf(rondaActual);
        siguienteRondaKey = format.knockoutStages[indiceRondaActual + 1];
    } else {
        if (currentTournament.config.formatId === 'flexible_league') {
            const numQualifiers = currentTournament.config.qualifiers;

            // --- LÓGICA DE LIGA PURA (0 Clasificados) ---
            if (numQualifiers === 0) {
                console.log(`[LIGA] Modo Liga Pura detectado. Finalizando torneo con el líder de la tabla.`);

                const leagueTeams = [...currentTournament.structure.grupos['Liga'].equipos];
                leagueTeams.sort((a, b) => sortTeams(a, b, currentTournament, 'Liga'));
                const campeon = leagueTeams[0];
                const subcampeon = leagueTeams[1];

                // Anunciar al campeón directamente sin crear una final
                const infoChannel = await client.channels.fetch(currentTournament.discordChannelIds.infoChannelId).catch(() => null);
                if (infoChannel) {
                    const embedCampeon = new EmbedBuilder()
                        .setColor('#ffd700')
                        .setTitle(`🎉 ¡Tenemos un Campeón! / We Have a Champion! 🎉`)
                        .setDescription(`**¡Felicidades a <@${campeon.capitanId}> (${campeon.nombre}) por ganar el torneo ${currentTournament.nombre}!**\n\n🥇 **Campeón:** ${campeon.nombre}\n🥈 **Subcampeón:** ${subcampeon ? subcampeon.nombre : 'N/A'}`)
                        .setThumbnail('https://i.imgur.com/C5mJg1s.png')
                        .setTimestamp();
                    await infoChannel.send({ content: `|| @everyone || <@${campeon.capitanId}>`, embeds: [embedCampeon] });
                }

                // Gestionar pagos si es torneo de pago
                if (currentTournament.config.isPaid) {
                    const notificationsThread = await client.channels.fetch(currentTournament.discordMessageIds.notificationsThreadId).catch(() => null);
                    if (notificationsThread) {
                        const embedPagoCampeon = new EmbedBuilder()
                            .setColor('#ffd700')
                            .setTitle('🏆 PAGO PENDIENTE: CAMPEÓN')
                            .addFields(
                                { name: 'Equipo', value: campeon.nombre },
                                { name: 'Capitán', value: campeon.capitanTag },
                                { name: 'PayPal a Pagar', value: `\`${campeon.paypal}\`` },
                                { name: 'Premio', value: `${currentTournament.config.prizeCampeon}€` }
                            );
                        const rowCampeon = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`admin_prize_paid:${currentTournament.shortId}:${campeon.capitanId}:campeon`)
                                .setLabel('Marcar Premio Campeón Pagado')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('💰')
                        );
                        await notificationsThread.send({ embeds: [embedPagoCampeon], components: [rowCampeon] });

                        if (currentTournament.config.prizeFinalista > 0 && subcampeon) {
                            const embedPagoFinalista = new EmbedBuilder()
                                .setColor('#C0C0C0')
                                .setTitle('🥈 PAGO PENDIENTE: FINALISTA')
                                .addFields(
                                    { name: 'Equipo', value: subcampeon.nombre },
                                    { name: 'Capitán', value: subcampeon.capitanTag },
                                    { name: 'PayPal a Pagar', value: `\`${subcampeon.paypal}\`` },
                                    { name: 'Premio', value: `${currentTournament.config.prizeFinalista}€` }
                                );
                            const rowFinalista = new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`admin_prize_paid:${currentTournament.shortId}:${subcampeon.capitanId}:finalista`)
                                    .setLabel('Marcar Premio Finalista Pagado')
                                    .setStyle(ButtonStyle.Success)
                                    .setEmoji('💰')
                            );
                            await notificationsThread.send({ embeds: [embedPagoFinalista], components: [rowFinalista] });
                        }
                    }
                }

                // Finalizar el torneo directamente sin crear estructura de final
                await db.collection('tournaments').updateOne(
                    { _id: currentTournament._id },
                    { $set: { status: 'finalizado' } }
                );

                const updatedTournament = await db.collection('tournaments').findOne({ _id: currentTournament._id });

                postTournamentUpdate('FINALIZADO', updatedTournament).catch(console.error);

                await updateTournamentManagementThread(client, updatedTournament);
                await updatePublicMessages(client, updatedTournament);
                await notifyTournamentVisualizer(updatedTournament);

                console.log(`[FINISH] El torneo ${currentTournament.shortId} ha finalizado (Liga Pura - Ganador por liderazgo).`);
                return;
            }
            // -------------------------------------------

            if (numQualifiers === 2) siguienteRondaKey = 'final';
            else if (numQualifiers === 4) siguienteRondaKey = 'semifinales';
            else if (numQualifiers === 8) siguienteRondaKey = 'cuartos';
            else if (numQualifiers === 16) siguienteRondaKey = 'octavos';
            else {
                console.error(`[ERROR] Número de clasificados no válido (${numQualifiers})`);
                return;
            }
        } else {
            siguienteRondaKey = format.knockoutStages[0];
        }
    }

    if (!siguienteRondaKey) {
        console.log(`[ADVANCEMENT] No hay más rondas eliminatorias.`);
        return;
    }

    if (currentTournament.status === siguienteRondaKey) return;

    let clasificados = [];

    if (!rondaActual) {
        if (currentTournament.config.formatId === 'flexible_league') {
            const leagueTeams = [...currentTournament.structure.grupos['Liga'].equipos];
            leagueTeams.sort((a, b) => sortTeams(a, b, currentTournament, 'Liga'));
            clasificados = leagueTeams.slice(0, currentTournament.config.qualifiers);
        } else {
            const gruposOrdenados = Object.keys(currentTournament.structure.grupos).sort();
            if (format.qualifiersPerGroup === 1) {
                for (const groupName of gruposOrdenados) {
                    const grupoOrdenado = [...currentTournament.structure.grupos[groupName].equipos].sort((a, b) => sortTeams(a, b, currentTournament, groupName));
                    if (grupoOrdenado[0]) clasificados.push(JSON.parse(JSON.stringify(grupoOrdenado[0])));
                }
            } else if (currentTournament.config.formatId === '8_teams_semis_classic') {
                const grupoA = [...currentTournament.structure.grupos['Grupo A'].equipos].sort((a, b) => sortTeams(a, b, currentTournament, 'Grupo A'));
                const grupoB = [...currentTournament.structure.grupos['Grupo B'].equipos].sort((a, b) => sortTeams(a, b, currentTournament, 'Grupo B'));
                clasificados.push(grupoA[0], grupoB[1], grupoB[0], grupoA[1]);
            } else if (format.bestThirds > 0) {
                // ── FORMATO CON MEJORES TERCEROS (ej: 12 equipos — 3 grupos) ──────────
                const bombo1 = [], bombo2 = [], thirds = [];
                for (const groupName of gruposOrdenados) {
                    const sorted = [...currentTournament.structure.grupos[groupName].equipos]
                        .sort((a, b) => sortTeams(a, b, currentTournament, groupName));
                    if (sorted[0]) bombo1.push({ team: JSON.parse(JSON.stringify(sorted[0])), group: groupName });
                    if (sorted[1]) bombo2.push({ team: JSON.parse(JSON.stringify(sorted[1])), group: groupName });
                    if (sorted[2]) thirds.push({ team: JSON.parse(JSON.stringify(sorted[2])), group: groupName });
                }

                // Ordenar los terceros entre sí: pts → dg → gf
                thirds.sort((a, b) => {
                    const sA = a.team.stats, sB = b.team.stats;
                    if (sB.pts !== sA.pts) return sB.pts - sA.pts;
                    if (sB.dg !== sA.dg) return sB.dg - sA.dg;
                    return sB.gf - sA.gf;
                });
                const bestThirdsSelected = thirds.slice(0, format.bestThirds);
                const eliminated3rds = thirds.slice(format.bestThirds);

                // Anunciar clasificados en el canal de info
                const infoCh = await client.channels.fetch(currentTournament.discordChannelIds.infoChannelId).catch(() => null);
                if (infoCh) {
                    const lines = [
                        ...bombo1.map(({ team, group }) => `🥇 **1º ${group}** — ${team.nombre}`),
                        ...bombo2.map(({ team, group }) => `🥈 **2º ${group}** — ${team.nombre}`),
                        ...bestThirdsSelected.map(({ team, group }, i) =>
                            `🔶 **Mejor 3º #${i + 1}** (${group}) — ${team.nombre}  ·  ${team.stats.pts}pts  ${team.stats.dg >= 0 ? '+' : ''}${team.stats.dg}dg`),
                        ...eliminated3rds.map(({ team, group }) =>
                            `❌ **3º eliminado** (${group}) — ${team.nombre}  ·  ${team.stats.pts}pts  ${team.stats.dg >= 0 ? '+' : ''}${team.stats.dg}dg`)
                    ];
                    await infoCh.send({
                        embeds: [new EmbedBuilder()
                            .setColor('#e67e22')
                            .setTitle('🌍 ¡Fase de Grupos Finalizada! — 8 Clasificados a Cuartos')
                            .setDescription(lines.join('\n'))
                            .setFooter({ text: currentTournament.nombre })
                            .setTimestamp()
                        ]
                    }).catch(console.error);
                }

                // Construir los 8 clasificados y generar cuartos de final
                const allQualifiers = [
                    ...bombo1.map(x => x.team),
                    ...bombo2.map(x => x.team),
                    ...bestThirdsSelected.map(x => x.team)
                ];
                const partidos = crearPartidosEliminatoria(allQualifiers, siguienteRondaKey);
                currentTournament.structure.eliminatorias[siguienteRondaKey] = partidos;
                clasificados = null;
                // ───────────────────────────────────────────────────────────────────
            } else {
                const bombo1 = []; const bombo2 = [];
                for (const groupName of gruposOrdenados) {
                    const grupoOrdenado = [...currentTournament.structure.grupos[groupName].equipos].sort((a, b) => sortTeams(a, b, currentTournament, groupName));
                    if (grupoOrdenado[0]) bombo1.push({ team: JSON.parse(JSON.stringify(grupoOrdenado[0])), group: groupName });
                    if (grupoOrdenado[1]) bombo2.push({ team: JSON.parse(JSON.stringify(grupoOrdenado[1])), group: groupName });
                }
                const partidos = crearPartidosEvitandoMismoGrupo(bombo1, bombo2, siguienteRondaKey);
                currentTournament.structure.eliminatorias[siguienteRondaKey] = partidos;
                clasificados = null;
            }
        }
    } else {
        const partidosRondaAnterior = currentTournament.structure.eliminatorias[rondaActual];
        clasificados = partidosRondaAnterior.map(p => {
            const [golesA, golesB] = p.resultado.split('-').map(Number);
            return golesA > golesB ? p.equipoA : p.equipoB;
        });
    }

    let partidos;
    if (clasificados) {
        if (currentTournament.config.formatId === '8_teams_semis_classic' && clasificados.length === 4 && !rondaActual) {
            partidos = [
                createMatchObject(null, siguienteRondaKey, clasificados[0], clasificados[1]),
                createMatchObject(null, siguienteRondaKey, clasificados[2], clasificados[3])
            ];
        } else {
            partidos = crearPartidosEliminatoria(clasificados, siguienteRondaKey);
        }
    } else {
        partidos = currentTournament.structure.eliminatorias[siguienteRondaKey];
    }

    if (!partidos || partidos.length === 0) return;

    const siguienteRondaNombre = siguienteRondaKey.charAt(0).toUpperCase() + siguienteRondaKey.slice(1);
    currentTournament.status = siguienteRondaKey;
    currentTournament.structure.eliminatorias.rondaActual = siguienteRondaKey;

    if (siguienteRondaKey === 'final') {
        currentTournament.structure.eliminatorias.final = partidos[0];
    } else {
        currentTournament.structure.eliminatorias[siguienteRondaKey] = partidos;
    }

    postTournamentUpdate('KNOCKOUT_MATCHUPS_CREATED', { matches: partidos, stage: siguienteRondaKey, tournament: currentTournament }).catch(console.error);

    const infoChannel = await client.channels.fetch(currentTournament.discordChannelIds.infoChannelId).catch(() => null);
    const embedAnuncio = new EmbedBuilder().setColor('#e67e22').setTitle(`🔥 ¡Comienza la Fase de ${siguienteRondaNombre}! 🔥`).setFooter({ text: '¡Mucha suerte!' });

    // Guardamos la estructura con los partidos en estado 'pendiente' ANTES de crear hilos
    await db.collection('tournaments').updateOne({ _id: currentTournament._id }, { $set: currentTournament });

    for (const p of partidos) {
        let lockQuery;
        let updatePath;

        if (siguienteRondaKey === 'final') {
            // Para la final, el partido está directamente en .final (no es array)
            lockQuery = {
                _id: currentTournament._id,
                'structure.eliminatorias.final.matchId': p.matchId,
                'structure.eliminatorias.final.threadId': null
            };
            updatePath = 'structure.eliminatorias.final';
        } else {
            // Para otras rondas, usamos $elemMatch para buscar en el array
            lockQuery = {
                _id: currentTournament._id,
                [`structure.eliminatorias.${siguienteRondaKey}`]: {
                    $elemMatch: {
                        matchId: p.matchId,
                        threadId: null
                    }
                }
            };
            updatePath = `structure.eliminatorias.${siguienteRondaKey}.$`;
        }

        // Bloqueo atómico robusto (sin índices)
        const result = await db.collection('tournaments').findOneAndUpdate(
            lockQuery,
            { $set: { [`${updatePath}.status`]: 'creando_hilo', [`${updatePath}.lockedAt`]: new Date() } },
            { returnDocument: 'after' }
        );

        if (!result) {
            console.log(`[KNOCKOUT] Hilo para ${p.matchId} ya gestionado por otro proceso.`);
            continue;
        }

        try {
            const threadId = await createMatchThread(client, guild, p, currentTournament.discordChannelIds.matchesChannelId, currentTournament.shortId);

            if (threadId) {
                p.threadId = threadId;
                p.status = 'en_curso';

                // Actualizar usando matchId para encontrar el partido específico
                if (siguienteRondaKey === 'final') {
                    await db.collection('tournaments').updateOne(
                        {
                            _id: currentTournament._id,
                            'structure.eliminatorias.final.matchId': p.matchId
                        },
                        {
                            $set: {
                                'structure.eliminatorias.final.threadId': threadId,
                                'structure.eliminatorias.final.status': 'en_curso'
                            }
                        }
                    );
                } else {
                    await db.collection('tournaments').updateOne(
                        {
                            _id: currentTournament._id,
                            [`structure.eliminatorias.${siguienteRondaKey}.matchId`]: p.matchId
                        },
                        {
                            $set: {
                                [`structure.eliminatorias.${siguienteRondaKey}.$.threadId`]: threadId,
                                [`structure.eliminatorias.${siguienteRondaKey}.$.status`]: 'en_curso'
                            }
                        }
                    );
                }
            } else {
                const revertPath = siguienteRondaKey === 'final'
                    ? 'structure.eliminatorias.final'
                    : `structure.eliminatorias.${siguienteRondaKey}.$`;

                await db.collection('tournaments').updateOne(
                    siguienteRondaKey === 'final'
                        ? { _id: currentTournament._id, 'structure.eliminatorias.final.matchId': p.matchId }
                        : { _id: currentTournament._id, [`structure.eliminatorias.${siguienteRondaKey}.matchId`]: p.matchId },
                    { $set: { [`${revertPath}.status`]: 'pendiente' } }
                );
            }
        } catch (error) {
            console.error(`[ERROR] Fallo al crear hilo knockout para ${p.matchId}:`, error);

            const revertPath = siguienteRondaKey === 'final'
                ? 'structure.eliminatorias.final'
                : `structure.eliminatorias.${siguienteRondaKey}.$`;

            await db.collection('tournaments').updateOne(
                siguienteRondaKey === 'final'
                    ? { _id: currentTournament._id, 'structure.eliminatorias.final.matchId': p.matchId }
                    : { _id: currentTournament._id, [`structure.eliminatorias.${siguienteRondaKey}.matchId`]: p.matchId },
                { $set: { [`${revertPath}.status`]: 'pendiente' } }
            );
        }

        embedAnuncio.addFields({ name: `Enfrentamiento`, value: `> ${p.equipoA.nombre} vs ${p.equipoB.nombre}` });
    }
    if (infoChannel) await infoChannel.send({ embeds: [embedAnuncio] });
    const finalTournamentState = await db.collection('tournaments').findOne({ _id: currentTournament._id });
    await notifyTournamentVisualizer(finalTournamentState);
    await updatePublicMessages(client, finalTournamentState);
    await updateTournamentManagementThread(client, finalTournamentState);
}

export async function handleFinalResult(client, guild, tournament) {
    const final = tournament.structure.eliminatorias.final;
    const [golesA, golesB] = final.resultado.split('-').map(Number);
    const campeon = golesA > golesB ? final.equipoA : final.equipoB;
    const finalista = golesA > golesB ? final.equipoB : final.equipoA;

    const infoChannel = await client.channels.fetch(tournament.discordChannelIds.infoChannelId).catch(() => null);
    if (infoChannel) {
        const embedCampeon = new EmbedBuilder().setColor('#ffd700').setTitle(`🎉 ¡Tenemos un Campeón! / We Have a Champion! 🎉`).setDescription(`**¡Felicidades a <@${campeon.capitanId}> (${campeon.nombre}) por ganar el torneo ${tournament.nombre}!**`).setThumbnail('https://i.imgur.com/C5mJg1s.png').setTimestamp();
        await infoChannel.send({ content: `|| @everyone || <@${campeon.capitanId}>`, embeds: [embedCampeon] });
    }

    if (tournament.config.isPaid) {
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (notificationsThread) {
            const embedPagoCampeon = new EmbedBuilder().setColor('#ffd700').setTitle('🏆 PAGO PENDIENTE: CAMPEÓN').addFields({ name: 'Equipo', value: campeon.nombre }, { name: 'Capitán', value: campeon.capitanTag }, { name: 'PayPal a Pagar', value: `\`${campeon.paypal}\`` }, { name: 'Premio', value: `${tournament.config.prizeCampeon}€` });
            const rowCampeon = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_prize_paid:${tournament.shortId}:${campeon.capitanId}:campeon`).setLabel('Marcar Premio Campeón Pagado').setStyle(ButtonStyle.Success).setEmoji('💰')
            );
            await notificationsThread.send({ embeds: [embedPagoCampeon], components: [rowCampeon] });

            if (tournament.config.prizeFinalista > 0) {
                const embedPagoFinalista = new EmbedBuilder().setColor('#C0C0C0').setTitle('🥈 PAGO PENDIENTE: FINALISTA').addFields({ name: 'Equipo', value: finalista.nombre }, { name: 'Capitán', value: finalista.capitanTag }, { name: 'PayPal a Pagar', value: `\`${finalista.paypal}\`` }, { name: 'Premio', value: `${tournament.config.prizeFinalista}€` });
                const rowFinalista = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`admin_prize_paid:${tournament.shortId}:${finalista.capitanId}:finalista`).setLabel('Marcar Premio Finalista Pagado').setStyle(ButtonStyle.Success).setEmoji('💰')
                );
                await notificationsThread.send({ embeds: [embedPagoFinalista], components: [rowFinalista] });
            }
        }
    }

    const db = getDb();
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });
    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });

    postTournamentUpdate('FINALIZADO', updatedTournament).catch(console.error);

    await updateTournamentManagementThread(client, updatedTournament);
    console.log(`[FINISH] El torneo ${tournament.shortId} ha finalizado.`);
}

function crearPartidosEliminatoria(equipos, ronda) {
    let partidos = [];
    const numEquipos = equipos.length;

    for (let i = 0; i < numEquipos / 2; i++) {
        const equipoA = equipos[i];
        const equipoB = equipos[numEquipos - 1 - i];

        if (equipoA && equipoB) {
            const partido = createMatchObject(null, ronda, equipoA, equipoB);
            partidos.push(partido);
        }
    }
    return partidos;
}

function crearPartidosEvitandoMismoGrupo(bombo1_data, bombo2_data, ronda) {
    const partidos = [];
    for (let i = bombo2_data.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bombo2_data[i], bombo2_data[j]] = [bombo2_data[j], bombo2_data[i]];
    }

    for (const data1 of bombo1_data) {
        let opponentData = null;
        let opponentIndex = -1;

        for (let i = 0; i < bombo2_data.length; i++) {
            if (data1.group !== bombo2_data[i].group) {
                opponentData = bombo2_data[i];
                opponentIndex = i;
                break;
            }
        }

        if (!opponentData && bombo2_data.length > 0) {
            opponentData = bombo2_data[0];
            opponentIndex = 0;
        }

        if (opponentData) {
            partidos.push(createMatchObject(null, ronda, data1.team, opponentData.team));
            bombo2_data.splice(opponentIndex, 1);
        }
    }
    return partidos;
}

function sortTeams(a, b, tournament, groupName) {
    if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;

    // --- TIE-BREAKS PARA SISTEMA SUIZO ---
    if (tournament.config.formatId === 'flexible_league' && tournament.config.leagueMode === 'custom_rounds') {
        if (a.stats.buchholz !== b.stats.buchholz) return b.stats.buchholz - a.stats.buchholz;
    }
    // -------------------------------------

    if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
    if (a.stats.gf !== b.stats.gf) return b.stats.gf - a.stats.gf;

    const enfrentamiento = tournament.structure.calendario[groupName]?.find(p =>
        p.resultado &&
        ((p.equipoA.id === a.id && p.equipoB.id === b.id) || (p.equipoA.id === b.id && p.equipoB.id === a.id))
    );

    if (enfrentamiento) {
        const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
        if (enfrentamiento.equipoA.id === a.id) {
            if (golesA > golesB) return -1;
            if (golesB > golesA) return 1;
        } else {
            if (golesB > golesA) return -1;
            if (golesA > golesB) return 1;
        }
    }
    return a.nombre.localeCompare(b.nombre);
}

export async function handleImportedPlayers(client, draftShortId, text) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) throw new Error('Draft no encontrado.');

    const parsedPlayers = parsePlayerList(text);
    if (parsedPlayers.length === 0) return { success: false, message: 'No se detectaron jugadores válidos en el texto.' };

    let addedCount = 0;
    let linkedCount = 0;
    let externalCount = 0;
    let removedCount = 0;
    let keptCount = 0;

    // 1. Identificar jugadores a MANTENER y a ELIMINAR
    // La lista de texto es la fuente de verdad.
    // Excepción: Capitanes (isCaptain: true) NO se tocan, a menos que estén explícitamente en la lista (lo cual es raro, pero bueno).
    // Estrategia:
    // - Recorrer los jugadores actuales del draft.
    // - Si es capitán -> MANTENER.
    // - Si NO es capitán:
    //    - Buscar si aparece en la lista importada (por WhatsApp o GameID).
    //    - Si aparece -> MANTENER (y actualizar datos si es necesario? Por ahora solo mantener).
    //    - Si NO aparece -> ELIMINAR.

    const newPlayersList = [];

    // Mapa para búsqueda rápida de la lista importada
    // Normalizamos IDs y WhatsApps para comparar
    const importedMap = new Map();
    parsedPlayers.forEach(p => {
        if (p.whatsapp) importedMap.set(p.whatsapp, p);
        if (p.gameId) importedMap.set(p.gameId.toLowerCase(), p);
    });

    // Filtrar jugadores actuales
    for (const currentP of draft.players) {
        if (currentP.isCaptain) {
            newPlayersList.push(currentP); // Los capitanes siempre se quedan
            continue;
        }

        let matchInImport = null;
        if (currentP.whatsapp && currentP.whatsapp !== '') {
            matchInImport = importedMap.get(currentP.whatsapp);
        }
        if (!matchInImport && currentP.psnId) {
            matchInImport = importedMap.get(currentP.psnId.toLowerCase());
        }

        if (matchInImport) {
            // El jugador está en la lista importada -> SE QUEDA
            // Podríamos actualizar la posición si ha cambiado en la lista
            if (matchInImport.position !== 'NONE') {
                currentP.primaryPosition = matchInImport.position;
            }
            newPlayersList.push(currentP);
            keptCount++;
            // Lo marcamos como procesado en el mapa para no añadirlo de nuevo como nuevo
            matchInImport._processed = true;
        } else {
            // El jugador NO está en la lista importada -> SE VA
            removedCount++;
        }
    }

    // 2. Identificar jugadores NUEVOS (los que quedan en parsedPlayers sin procesar)
    for (const p of parsedPlayers) {
        if (p._processed) continue; // Ya estaba en el draft

        // Try to link with verified user
        // Escapar caracteres especiales en gameId para evitar SyntaxError en la RegExp
        const escapedGameId = p.gameId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const queryOr = [{ gameId: { $regex: new RegExp(`^${escapedGameId}$`, 'i') } }];
        if (p.whatsapp && p.whatsapp !== '') {
            queryOr.push({ whatsapp: p.whatsapp });
        }

        const verifiedUser = await db.collection('verified_users').findOne({
            $or: queryOr
        });

        let playerData;

        if (verifiedUser) {
            linkedCount++;
            playerData = {
                userId: verifiedUser.discordId,
                userName: verifiedUser.discordTag,
                psnId: p.gameId, // Force use of the TXT name, to fix old name display bugs
                twitter: verifiedUser.twitter,
                whatsapp: verifiedUser.whatsapp,
                primaryPosition: p.position,
                secondaryPosition: 'NONE',
                currentTeam: 'Libre',
                isCaptain: false,
                captainId: null,
                isExternal: false
            };
        } else {
            externalCount++;
            const randomId = Math.random().toString(36).substring(2, 10);
            playerData = {
                userId: `ext_${randomId}`,
                userName: `Externo (${p.gameId})`,
                psnId: p.gameId,
                twitter: 'N/A',
                whatsapp: p.whatsapp,
                primaryPosition: p.position,
                secondaryPosition: 'NONE',
                currentTeam: 'Libre',
                isCaptain: false,
                captainId: null,
                isExternal: true
            };
        }

        newPlayersList.push(playerData);
        addedCount++;
    }

    // 3. Guardar cambios
    await db.collection('drafts').updateOne(
        { _id: draft._id },
        { $set: { players: newPlayersList } }
    );

    // Update interfaces
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
    await notifyVisualizer(updatedDraft);

    const summary = `**Resumen de Importación:**\n` +
        `✅ Añadidos: ${addedCount}\n` +
        `🔗 Vinculados: ${linkedCount}\n` +
        `👤 Externos: ${externalCount}\n` +
        `♻️ Mantenidos: ${keptCount}\n` +
        `🗑️ Eliminados: ${removedCount}`;

    return {
        success: true,
        message: summary,
        stats: {
            added: addedCount,
            linked: linkedCount,
            external: externalCount,
            kept: keptCount,
            removed: removedCount
        }
    };
}

export async function addSinglePlayerToDraft(client, draftShortId, data) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) throw new Error('Draft no encontrado.');

    const { gameId, whatsapp, position, discordId } = data;

    // 1. Check duplicates
    const alreadyInDraft = draft.players.some(dp =>
        dp.psnId.toLowerCase() === gameId.toLowerCase() ||
        (dp.whatsapp && dp.whatsapp === whatsapp) ||
        (discordId && dp.userId === discordId)
    );

    if (alreadyInDraft) {
        return { success: false, message: '❌ El jugador ya está inscrito en este draft (por ID, WhatsApp o Discord ID).' };
    }

    let playerData;
    let linked = false;

    // 2. Try to link
    if (discordId) {
        // Explicit link requested
        const verifiedUser = await db.collection('verified_users').findOne({ discordId: discordId });
        if (verifiedUser) {
            playerData = {
                userId: verifiedUser.discordId,
                userName: verifiedUser.discordTag,
                psnId: verifiedUser.gameId, // Prefer verified ID
                twitter: verifiedUser.twitter,
                whatsapp: verifiedUser.whatsapp || whatsapp, // Update if missing? For now just use what we have
                primaryPosition: position,
                secondaryPosition: 'NONE',
                currentTeam: 'Libre',
                isCaptain: false,
                captainId: null,
                isExternal: false
            };
            linked = true;
        } else {
            // Discord ID provided but not verified -> Add as external but with that ID? Or warn?
            // Better to warn, as we want verified users.
            // But maybe the admin just wants to link a user who is in the server but not verified?
            // For now, let's treat as external but use the provided ID if valid snowflake, else random.
            // Actually, if admin provides ID, they probably want to tag them.
            // Let's fetch the user from client to get username.
            try {
                const user = await client.users.fetch(discordId);
                playerData = {
                    userId: discordId,
                    userName: user.username,
                    psnId: gameId,
                    twitter: 'N/A',
                    whatsapp: whatsapp,
                    primaryPosition: position,
                    secondaryPosition: 'NONE',
                    currentTeam: 'Libre',
                    isCaptain: false,
                    captainId: null,
                    isExternal: false // It is a real discord user
                };
                linked = true;
            } catch (e) {
                return { success: false, message: '❌ El ID de Discord proporcionado no es válido o el bot no puede encontrar al usuario.' };
            }
        }
    } else {
        // Auto-link attempt
        const verifiedUser = await db.collection('verified_users').findOne({
            $or: [
                { gameId: { $regex: new RegExp(`^${gameId}$`, 'i') } },
                { whatsapp: whatsapp }
            ]
        });

        if (verifiedUser) {
            playerData = {
                userId: verifiedUser.discordId,
                userName: verifiedUser.discordTag,
                psnId: verifiedUser.gameId,
                twitter: verifiedUser.twitter,
                whatsapp: verifiedUser.whatsapp,
                primaryPosition: position,
                secondaryPosition: 'NONE',
                currentTeam: 'Libre',
                isCaptain: false,
                captainId: null,
                isExternal: false
            };
            linked = true;
        } else {
            // External
            const randomId = Math.random().toString(36).substring(2, 10);
            playerData = {
                userId: `ext_${randomId}`,
                userName: `Externo (${gameId})`,
                psnId: gameId,
                twitter: 'N/A',
                whatsapp: whatsapp,
                primaryPosition: position,
                secondaryPosition: 'NONE',
                currentTeam: 'Libre',
                isCaptain: false,
                captainId: null,
                isExternal: true
            };
        }
    }

    await db.collection('drafts').updateOne(
        { _id: draft._id },
        { $push: { players: playerData } }
    );

    // Update interfaces
    const updatedDraftAfterAdd = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraftAfterAdd.shortId);
    await updatePublicMessages(client, updatedDraftAfterAdd);
    await updateDraftManagementPanel(client, updatedDraftAfterAdd);
    await notifyVisualizer(updatedDraftAfterAdd);

    return {
        success: true,
        message: linked
            ? `✅ Jugador **${playerData.psnId}** añadido y vinculado correctamente (<@${playerData.userId}>).`
            : `✅ Jugador Externo **${playerData.psnId}** añadido correctamente.`
    };
}

export async function adminAddPlayerFromWeb(client, draftShortId, teamId, playerId, adminName) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) throw new Error('Draft no encontrado.');

    const team = draft.teams.find(t => t.id === teamId);
    if (!team) throw new Error('Equipo no encontrado.');

    const player = draft.players.find(p => p.userId === playerId);
    if (!player) throw new Error('Jugador no encontrado en la pool.');

    if (player.currentTeam !== 'Libre') throw new Error('El jugador ya tiene equipo.');

    // Asignar al equipo
    player.currentTeam = team.name;
    player.captainId = team.userId; // Asumiendo que team.userId es el ID del capitán
    team.players.push(player);

    await db.collection('drafts').updateOne(
        { _id: draft._id },
        {
            $set: {
                players: draft.players,
                teams: draft.teams
            }
        }
    );

    // Update interfaces
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
    await notifyVisualizer(updatedDraft);

    console.log(`[ADMIN] Jugador ${player.psnId} añadido a ${team.name} por ${adminName} desde web.`);
}

export async function swapTeamsDataOnly(client, tournamentShortId, teamIdA, teamIdB) {
    const db = getDb();
    const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!tournament) throw new Error('Torneo no encontrado');

    // Verificar estado: Solo si no han empezado o si es inscripción
    const allMatches = Object.values(tournament.structure.calendario).flat();
    const hasResults = allMatches.some(m => m.status === 'finalizado' || (m.reportedScores && Object.keys(m.reportedScores).length > 0));

    if (hasResults) {
        throw new Error('No se pueden intercambiar equipos porque ya hay partidos jugados o reportados. Resetea el torneo primero si es necesario.');
    }

    // 1. Encontrar equipos y sus grupos
    let groupA, groupB, indexA, indexB;
    let teamDataA, teamDataB;

    for (const gName in tournament.structure.grupos) {
        const g = tournament.structure.grupos[gName];
        const idx = g.equipos.findIndex(t => t.id === teamIdA);
        if (idx !== -1) { groupA = gName; indexA = idx; teamDataA = g.equipos[idx]; }

        const idx2 = g.equipos.findIndex(t => t.id === teamIdB);
        if (idx2 !== -1) { groupB = gName; indexB = idx2; teamDataB = g.equipos[idx2]; }
    }

    if (!teamDataA || !teamDataB) throw new Error('Uno de los equipos no fue encontrado en los grupos.');
    if (groupA === groupB) throw new Error('Los equipos ya están en el mismo grupo.');

    // 2. Intercambiar en la estructura de grupos
    tournament.structure.grupos[groupA].equipos[indexA] = teamDataB;
    tournament.structure.grupos[groupB].equipos[indexB] = teamDataA;

    // 3. Guardar grupos cambiados (SIN REGENERAR CALENDARIO AÚN)
    await db.collection('tournaments').updateOne(
        { _id: tournament._id },
        { $set: { "structure.grupos": tournament.structure.grupos } }
    );

    return { success: true, message: `Equipos intercambiados: ${teamDataA.nombre} <-> ${teamDataB.nombre}` };
}

export async function regenerateGroupStage(client, tournamentShortId) {
    const db = getDb();
    const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!tournament) throw new Error('Torneo no encontrado');

    const allMatches = Object.values(tournament.structure.calendario).flat();

    // Borrar hilos antiguos
    for (const match of allMatches) {
        if (match.threadId) {
            const thread = await client.channels.fetch(match.threadId).catch(() => null);
            if (thread) await thread.delete('Regeneración de calendario por intercambio de equipos.').catch(() => { });
        }
    }

    // Regenerar calendario llamando a la función existente
    if (tournament.config.formatId === 'flexible_league') {
        await generateFlexibleLeagueSchedule(tournament, true);
    } else {
        await generateGroupBasedSchedule(tournament, true);
    }

    // Re-crear hilos para la jornada 1
    const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    const newMatches = Object.values(updatedTournament.structure.calendario).flat();
    const guild = await client.guilds.fetch(tournament.guildId);

    for (const match of newMatches) {
        if (match.jornada === 1 && !match.threadId && match.equipoA.id !== 'ghost' && match.equipoB.id !== 'ghost') {
            const gKey = match.nombreGrupo;
            const mIdx = updatedTournament.structure.calendario[gKey].findIndex(m => m.matchId === match.matchId);

            if (mIdx > -1) {
                const fieldPath = `structure.calendario.${gKey}.${mIdx}`;

                // Bloqueo atómico
                const result = await db.collection('tournaments').findOneAndUpdate(
                    {
                        _id: updatedTournament._id,
                        [`${fieldPath}.threadId`]: null,
                        [`${fieldPath}.status`]: { $ne: 'en_curso' }
                    },
                    { $set: { [`${fieldPath}.status`]: 'creando_hilo' } },
                    { returnDocument: 'after' }
                );

                if (!result) continue;

                try {
                    const threadId = await createMatchThread(client, guild, match, updatedTournament.discordChannelIds.matchesChannelId, updatedTournament.shortId);

                    if (threadId) {
                        await db.collection('tournaments').updateOne(
                            { _id: updatedTournament._id },
                            { $set: { [`${fieldPath}.threadId`]: threadId, [`${fieldPath}.status`]: 'en_curso' } }
                        );
                    } else {
                        await db.collection('tournaments').updateOne(
                            { _id: updatedTournament._id },
                            { $set: { [`${fieldPath}.status`]: 'pendiente' } }
                        );
                    }
                } catch (error) {
                    console.error(`[ERROR] Fallo al crear hilo en regenerateGroupStage para ${match.matchId}:`, error);
                    await db.collection('tournaments').updateOne(
                        { _id: updatedTournament._id },
                        { $set: { [`${fieldPath}.status`]: 'pendiente' } }
                    );
                }
                // Pausa entre creaciones de hilos para evitar rate limit de Discord
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    }

    const finalTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    await updatePublicMessages(client, finalTournament);
    await updateTournamentManagementThread(client, finalTournament);
    await notifyTournamentVisualizer(finalTournament);

    return { success: true, message: 'Calendario regenerado correctamente.' };
}

export async function adminKickPlayerFromWeb(client, draftShortId, teamId, playerId, adminName) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) throw new Error('Draft no encontrado.');

    // 1. Eliminar de la lista global de jugadores (Pool)
    await db.collection('drafts').updateOne(
        { _id: draft._id },
        { $pull: { players: { userId: playerId } } }
    );

    // 2. Eliminar del equipo específico (si estaba en uno)
    if (teamId) {
        await db.collection('drafts').updateOne(
            { _id: draft._id, "teams.id": teamId },
            { $pull: { "teams.$.players": { userId: playerId } } }
        );
    }

    // 3. Por seguridad, eliminar de CUALQUIER equipo (por si el teamId venía mal o estaba duplicado)
    // Esto es una operación más costosa pero segura: iterar todos los equipos y hacer pull.
    // Pero MongoDB permite actualizar todos los elementos de un array que cumplan condición.
    // "teams.$[].players" actualiza todos los equipos.
    await db.collection('drafts').updateOne(
        { _id: draft._id },
        { $pull: { "teams.$[].players": { userId: playerId } } }
    );

    // Update interfaces
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
    await notifyVisualizer(updatedDraft);

    console.log(`[ADMIN] Jugador ${playerId} ELIMINADO COMPLETAMENTE del draft ${draftShortId} por ${adminName} desde web.`);
}

export async function forcePickFromWeb(client, draftShortId, playerId, position, adminName) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) throw new Error('Draft no encontrado.');

    const currentCaptainId = draft.selection.order[draft.selection.turn];
    if (!currentCaptainId) throw new Error('No hay turno activo.');

    const targetPlayer = draft.players.find(p => p.userId === playerId);
    if (!targetPlayer) throw new Error('Jugador no encontrado en el draft.');

    // Reutilizamos la lógica existente de selección
    // Elegimos la poscición pasada desde el frontend, o la primaria por defecto
    const finalPosition = position && position !== 'Todos' ? position : targetPlayer.primaryPosition;
    await handlePlayerSelectionFromWeb(client, draftShortId, currentCaptainId, playerId, finalPosition);

    console.log(`[ADMIN] Pick forzado por ${adminName} para el capitán ${currentCaptainId} con el jugador ${playerId} en la posición ${finalPosition}`);
}

export async function undoLastPick(client, draftShortId, adminName) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) throw new Error('Draft no encontrado.');

    if (draft.selection.currentPick <= 1) throw new Error('No hay picks para deshacer.');

    // 1. Identificar el pick anterior usando lastPick o buscando el último jugador pickeado
    const lastPick = draft.selection.lastPick;
    let playerToUndo;

    if (lastPick && lastPick.playerId) {
        // Usar el lastPick guardado para identificar exactamente qué jugador deshacer
        playerToUndo = draft.players.find(p => p.userId === lastPick.playerId);
    }

    if (!playerToUndo) {
        // Fallback: buscar el último jugador que fue asignado (basado en el capitán del turno anterior)
        const previousTurnIndex = draft.selection.turn > 0 ? draft.selection.turn - 1 : draft.selection.order.length - 1;
        const previousCaptainId = draft.selection.order[previousTurnIndex];
        const teamPlayers = draft.players.filter(p => p.captainId === previousCaptainId && !p.isCaptain);
        if (teamPlayers.length === 0) throw new Error('No se pudo encontrar el último pick para deshacer.');
        playerToUndo = teamPlayers[teamPlayers.length - 1];
    }

    // 2. Devolver al jugador a la pool (limpiar captainId y pickedForPosition)
    // Calcular el turno correcto para el pick anterior usando la fórmula snake
    const newCurrentPick = draft.selection.currentPick - 1;
    const numCaptains = draft.captains.length;
    const prevRound = Math.floor((newCurrentPick - 1) / numCaptains);
    const prevPosInRound = (newCurrentPick - 1) % numCaptains;
    const previousTurnIndex = (prevRound % 2 === 0) ? prevPosInRound : (numCaptains - 1 - prevPosInRound);

    await db.collection('drafts').updateOne(
        { _id: draft._id, "players.userId": playerToUndo.userId },
        {
            $set: {
                "players.$.captainId": null,
                "players.$.pickedForPosition": null,
                "selection.turn": previousTurnIndex,
                "selection.currentPick": newCurrentPick,
                "selection.isPicking": false,
                "selection.activeInteractionId": null,
                "selection.lastPick": null  // Limpiar lastPick para evitar alertas fantasma
            }
        }
    );

    console.log(`[ADMIN] Pick deshecho por ${adminName}: jugador ${playerToUndo.psnId} devuelto a la pool.`);

    // Update interfaces
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateDraftMainInterface(client, updatedDraft.shortId);
    await updatePublicMessages(client, updatedDraft);
    await updateDraftManagementPanel(client, updatedDraft);
    await updateCaptainControlPanel(client, updatedDraft);
    await notifyVisualizer(updatedDraft);
}

export async function adminReplacePickFromWeb(client, draftShortId, teamId, oldPlayerId, newPlayerId, disposition, adminName) {
    const db = getDb();
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    if (!draft) throw new Error('Draft no encontrado.');

    // 1. Validar nuevo jugador
    const newPlayerPool = draft.players.find(p => p.userId === newPlayerId && (!p.captainId || p.currentTeam === 'Libre'));
    if (!newPlayerPool) throw new Error('El jugador de reemplazo no está disponible o no existe.');

    // 2. Encontrar equipo y antiguo jugador
    const oldPlayer = draft.players.find(p => p.userId === oldPlayerId && p.captainId === teamId);
    if (!oldPlayer) throw new Error('El jugador antiguo no pertenece a ese equipo.');

    const teamCaptain = draft.captains.find(c => c.userId === teamId);
    if (!teamCaptain) throw new Error('Equipo no encontrado.');

    // 4. Modificar estados en array global de players
    let playersArray = draft.players.map(p => {
        if (p.userId === newPlayerId) {
            return { ...p, captainId: teamCaptain.userId, currentTeam: teamCaptain.teamName, pickedForPosition: oldPlayer.pickedForPosition || oldPlayer.primaryPosition };
        } else if (p.userId === oldPlayerId) {
            if (disposition === 'release') {
                return { ...p, captainId: null, currentTeam: 'Libre', pickedForPosition: null };
            }
        }
        return p;
    });

    if (disposition === 'kick') {
        playersArray = playersArray.filter(p => p.userId !== oldPlayerId);
    }

    // Guardar cambios a BDD
    await db.collection('drafts').updateOne(
        { _id: draft._id },
        {
            $set: {
                players: playersArray
            }
        }
    );

    draft.players = playersArray;
    await updateDraftMainInterface(client, draft.shortId);
    await updatePublicMessages(client, draft);
    await notifyVisualizer(draft);

    console.log(`[ADMIN] Jugador ${oldPlayerId} reemplazado por ${newPlayerId} en el equipo ${teamId} por ${adminName}.`);
}

/**
 * Recupera hilos perdidos para partidos que están en la DB pero no tienen threadId
 * Útil cuando el bot falla a mitad de generación de ronda
 */
export async function recoverLostThreads(client, guild, tournamentShortId) {
    const db = getDb();
    const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

    if (!tournament) {
        throw new Error(`Torneo ${tournamentShortId} no encontrado.`);
    }

    let recovered = 0;
    let failed = 0;
    const errors = [];

    console.log(`[RECOVER] Escaneando torneo ${tournamentShortId} en busca de hilos perdidos...`);

    // Escanear Grupos (Swiss o Grupos tradicionales)
    if (tournament.structure.grupos) {
        for (const [groupName, group] of Object.entries(tournament.structure.grupos)) {
            const matches = tournament.structure.calendario[groupName] || [];

            for (const match of matches) {
                // Saltar si ya tiene hilo, o es un BYE, o está finalizado sin hilo
                if (match.threadId || match.equipoB?.id === 'ghost' || !match.equipoA || !match.equipoB) {
                    continue;
                }

                console.log(`[RECOVER] Encontrado partido huérfano: ${match.matchId} (${match.equipoA.nombre} vs ${match.equipoB.nombre})`);

                try {
                    // Bloquear atómicamente
                    const lockResult = await db.collection('tournaments').findOneAndUpdate(
                        {
                            _id: tournament._id,
                            [`structure.calendario.${groupName}`]: {
                                $elemMatch: {
                                    matchId: match.matchId,
                                    threadId: null
                                }
                            }
                        },
                        {
                            $set: {
                                [`structure.calendario.${groupName}.$.status`]: 'creando_hilo',
                                [`structure.calendario.${groupName}.$.lockedAt`]: new Date()
                            }
                        },
                        { returnDocument: 'after' }
                    );

                    if (!lockResult) {
                        console.log(`[RECOVER] El partido ${match.matchId} ya tiene hilo.`);
                        continue;
                    }

                    const threadId = await createMatchThread(client, guild, match, tournament.discordChannelIds.matchesChannelId, tournament.shortId);

                    if (threadId) {
                        await db.collection('tournaments').updateOne(
                            {
                                _id: tournament._id,
                                [`structure.calendario.${groupName}.matchId`]: match.matchId
                            },
                            {
                                $set: {
                                    [`structure.calendario.${groupName}.$.threadId`]: threadId,
                                    [`structure.calendario.${groupName}.$.status`]: 'en_curso'
                                }
                            }
                        );
                        recovered++;
                        console.log(`[RECOVER] ✅ Hilo creado: ${threadId}`);
                    } else {
                        throw new Error('createMatchThread devolvió null');
                    }
                } catch (error) {
                    failed++;
                    errors.push(`${match.matchId}: ${error.message}`);
                    console.error(`[RECOVER] ❌ Error:`, error);

                    // Revertir bloqueo
                    await db.collection('tournaments').updateOne(
                        {
                            _id: tournament._id,
                            [`structure.calendario.${groupName}.matchId`]: match.matchId
                        },
                        {
                            $set: {
                                [`structure.calendario.${groupName}.$.status`]: 'pendiente'
                            }
                        }
                    ).catch(e => console.error('[RECOVER] Error al revertir:', e));
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    const summary = {
        recovered,
        failed,
        errors: errors.length > 0 ? errors : null
    };

    console.log(`[RECOVER] Finalizado. Recuperados: ${recovered}, Fallidos: ${failed}`);
    return summary;
}

/**
 * Repara el hilo de un partido específico con validación robusta
 * @param {Object} client - Cliente de Discord
 * @param {Object} guild - Servidor de Discord
 * @param {string} tournamentShortId - ID del torneo
 * @param {string} matchId - ID del partido específico
 * @returns {Promise<{success: boolean, threadId?: string, error?: string, wasOrphan?: boolean}>}
 */
export async function repairSingleMatchThread(client, guild, tournamentShortId, matchId) {
    const db = getDb();

    try {
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return { success: false, error: 'Torneo no encontrado' };
        }

        // Buscar el partido en todos los grupos
        let match = null;
        let groupKey = null;

        if (tournament.structure.calendario) {
            for (const [gName, matches] of Object.entries(tournament.structure.calendario)) {
                const foundMatch = matches.find(m => m.matchId === matchId);
                if (foundMatch) {
                    match = foundMatch;
                    groupKey = gName;
                    break;
                }
            }
        }

        if (!match) {
            return { success: false, error: 'Partido no encontrado en el calendario' };
        }

        // Verificar si es un partido válido para reparar
        if (match.equipoB?.id === 'ghost') {
            return { success: false, error: 'No se puede crear hilo para partidos BYE' };
        }

        if (match.status === 'finalizado') {
            return { success: false, error: 'El partido ya está finalizado' };
        }

        // VALIDACIÓN ROBUSTA: Verificar si el hilo realmente existe en Discord
        let wasOrphan = false;
        if (match.threadId) {
            try {
                // Intentar obtener el hilo de Discord
                await client.channels.fetch(match.threadId);
                // Si llegamos aquí, el hilo existe correctamente
                return {
                    success: false,
                    error: `El partido ya tiene un hilo válido (ID: ${match.threadId})`
                };
            } catch (error) {
                // El hilo no existe en Discord, está huérfano
                console.log(`[REPAIR] ThreadId ${match.threadId} existe en DB pero no en Discord. Será reemplazado.`);
                wasOrphan = true;
            }
        }

        // Bloqueo atómico para evitar duplicados
        const lockResult = await db.collection('tournaments').findOneAndUpdate(
            {
                _id: tournament._id,
                [`structure.calendario.${groupKey}`]: {
                    $elemMatch: {
                        matchId: matchId
                    }
                }
            },
            {
                $set: {
                    [`structure.calendario.${groupKey}.$.status`]: 'creando_hilo'
                }
            },
            { returnDocument: 'after' }
        );

        if (!lockResult) {
            return { success: false, error: 'No se pudo bloquear el partido para reparación' };
        }

        try {
            // Crear el hilo
            const threadId = await createMatchThread(
                client,
                guild,
                match,
                tournament.discordChannelIds.matchesChannelId,
                tournament.shortId
            );

            if (!threadId) {
                throw new Error('createMatchThread devolvió null');
            }

            // Actualizar la DB con el nuevo threadId
            await db.collection('tournaments').updateOne(
                {
                    _id: tournament._id,
                    [`structure.calendario.${groupKey}.matchId`]: matchId
                },
                {
                    $set: {
                        [`structure.calendario.${groupKey}.$.threadId`]: threadId,
                        [`structure.calendario.${groupKey}.$.status`]: 'en_curso'
                    }
                }
            );

            console.log(`[REPAIR] ✅ Hilo creado exitosamente para ${matchId}: ${threadId}`);

            return {
                success: true,
                threadId,
                wasOrphan
            };

        } catch (error) {
            // Revertir bloqueo en caso de error
            await db.collection('tournaments').updateOne(
                {
                    _id: tournament._id,
                    [`structure.calendario.${groupKey}.matchId`]: matchId
                },
                {
                    $set: {
                        [`structure.calendario.${groupKey}.$.status`]: 'pendiente'
                    }
                }
            ).catch(e => console.error('[REPAIR] Error al revertir:', e));

            console.error(`[REPAIR] ❌ Error al crear hilo:`, error);
            return {
                success: false,
                error: error.message || 'Error desconocido al crear el hilo'
            };
        }

    } catch (error) {
        console.error('[REPAIR] Error general:', error);
        return {
            success: false,
            error: error.message || 'Error crítico durante la reparación'
        };
    }
}

// Función para enviar solicitud de inscripción a Discord
export async function sendRegistrationRequest(client, tournament, team, user, paymentUrl = null) {
    try {
        // CORRECCIÓN CRÍTICA: Intentar usar el hilo de notificaciones del torneo PRIMERO
        let channelId = tournament.discordMessageIds?.notificationsThreadId;

        // Si no hay hilo, usar channel global como fallback
        if (!channelId) {
            channelId = process.env.ADMIN_APPROVAL_CHANNEL_ID || '1405086450583732245';
        }

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            console.error(`[sendRegistrationRequest] No se pudo encontrar canal/hilo ${channelId}`);
            // Fallback al canal global si falló el hilo
            const globalChannelId = process.env.ADMIN_APPROVAL_CHANNEL_ID || '1405086450583732245';
            if (channelId !== globalChannelId) {
                return sendRegistrationRequest(client, tournament, team, user, paymentUrl); // Reintentar con global (cuidado con recursión infinita si global falla tb)
            }
            return null;
        }

        const isPaid = tournament.inscripcion === 'Pago';
        const color = isPaid ? '#f1c40f' : '#3498db';
        const title = isPaid ? '💰 Nueva Inscripción (PAGO)' : '📝 Nueva Cláusula (GRATIS)';

        // Data mapping seguro para evitar 'undefined'
        const teamName = team.name || team.nombre || 'Equipo Desconocido';
        const teamAbbr = team.abbreviation || team.shortName || 'N/A';
        const teamRegion = team.region || 'EU';
        const userName = user.username || user.tag || 'Usuario';

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(`Solicitud para el torneo: **${tournament.nombre}**`)
            .addFields(
                { name: 'Equipo', value: `${teamName} (${teamAbbr})`, inline: true },
                { name: 'Manager/Capitán', value: `<@${user.id}> (${userName})`, inline: true },
                { name: 'Región', value: teamRegion, inline: true },
                { name: 'Estado', value: '⏳ Pendiente de Aprobación', inline: false }
            )
            .setThumbnail(team.logoUrl || '')
            .setTimestamp()
            .setFooter({ text: `Team ID: ${team._id || team.id} | User ID: ${user.id}` });

        if (paymentUrl) {
            embed.setImage(paymentUrl);
            embed.addFields({ name: 'Comprobante de Pago', value: 'Adjunto en la imagen inferior' });
        }

        // Usar el patrón de botones existente: admin_approve:{captainId}:{tournamentShortId}
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_approve:${user.id}:${tournament.shortId}`)
                    .setLabel('✅ Aprobar Inscripción')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`admin_reject:${user.id}:${tournament.shortId}`)
                    .setLabel('❌ Rechazar')
                    .setStyle(ButtonStyle.Danger)
            );

        // Si es de pago y tiene comprobante, añadir botón para ver original
        if (paymentUrl) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel('Ver Comprobante')
                    .setStyle(ButtonStyle.Link)
                    .setURL(paymentUrl)
            );
        }

        const message = await channel.send({
            content: `Nueva solicitud de inscripción de <@${user.id}>`,
            embeds: [embed],
            components: [row]
        });

        return message.id;

    } catch (error) {
        console.error('Error enviando solicitud a Discord:', error);
        return null;
    }
}

/**
 * Enviar solicitud de aprobación de pago (primera aprobación web)
 * Similar a sendRegistrationRequest pero para torneos de pago con doble aprobación
 */
export async function sendPaymentApprovalRequest(client, tournament, teamData, user) {
    try {
        // CORRECCIÓN: Usar hilo de notificaciones del torneo PRIMERO
        let approvalChannelId = tournament.discordMessageIds?.notificationsThreadId;

        // Fallback al canal global si no hay hilo
        if (!approvalChannelId) {
            approvalChannelId = process.env.ADMIN_APPROVAL_CHANNEL_ID;
            if (!approvalChannelId) {
                console.error('[Payment Approval Request] ADMIN_APPROVAL_CHANNEL_ID not configured');
                return null;
            }
        }

        const channel = await client.channels.fetch(approvalChannelId);
        if (!channel) {
            console.error('[Payment Approval Request] Approval channel not found');
            return null;
        }

        const embed = new EmbedBuilder()
            .setColor('#f39c12')
            .setTitle('💰 Nueva Solicitud - Torneo de Pago (WEB)')
            .setDescription(`Usuario quiere inscribirse en **${tournament.nombre}**`)
            .addFields(
                { name: 'Usuario', value: `<@${user.id}> (${user.username})`, inline: true },
                { name: 'Equipo', value: teamData.teamName || teamData.nombre || 'Desconocido', inline: true },
                { name: 'EAFC Team', value: teamData.eafcTeamName, inline: false },
                { name: 'Stream', value: teamData.streamChannel || 'N/A', inline: true },
                { name: 'Twitter', value: teamData.twitter || 'N/A', inline: true }
            )
            .setFooter({ text: 'Aprueba para enviarle la información de pago' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_approve_payment_info:${user.id}:${tournament.shortId}`)
                .setLabel('✅ Aprobar - Enviar Info Pago')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`admin_reject:${user.id}:${tournament.shortId}`)
                .setLabel('❌ Rechazar Solicitud')
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({ embeds: [embed], components: [row] });
        console.log(`[Payment Approval Request] Web registration notification sent for ${teamData.teamName}`);

    } catch (error) {
        console.error('[Payment Approval Request] Error sending notification:', error);
    }
}
