// src/handlers/buttonHandler.js
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, PermissionsBitField } from 'discord.js';
import { getDb, getBotSettings, updateBotSettings } from '../../database.js';
import { TOURNAMENT_FORMATS, ARBITRO_ROLE_ID, DRAFT_POSITIONS } from '../../config.js';
import {
    approveTeam, startGroupStage, endTournament, kickTeam, notifyCaptainsOfChanges, requestUnregister,
    addCoCaptain, undoGroupStageDraw, startDraftSelection, advanceDraftTurn, confirmPrizePayment,
    approveDraftCaptain, endDraft, simulateDraftPicks, handlePlayerSelection, requestUnregisterFromDraft,
    approveUnregisterFromDraft, updateCaptainControlPanel, requestPlayerKick, handleKickApproval,
    forceKickPlayer, removeStrike, pardonPlayer, acceptReplacement
} from '../logic/tournamentLogic.js';
import { findMatch, simulateAllPendingMatches } from '../logic/matchLogic.js';
import { updateAdminPanel } from '../utils/panelManager.js';
import { createRuleAcceptanceEmbed, createDraftStatusEmbed, createTeamRosterManagementEmbed } from '../utils/embeds.js';
import { setBotBusy } from '../../index.js';
import { updateMatchThreadName, inviteUserToMatchThread } from '../utils/tournamentUtils.js';

export async function handleButton(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    
    const [action, ...params] = customId.split(':');

    if (action === 'admin_manage_drafts_players') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const activeDrafts = await db.collection('drafts').find({ status: { $nin: ['torneo_generado', 'cancelado'] } }).toArray();

        if (activeDrafts.length === 0) {
            return interaction.editReply({ content: 'No hay drafts activos para gestionar en este momento.' });
        }

        const draftOptions = activeDrafts.map(d => ({
            label: d.name,
            description: `Estado: ${d.status} | ID: ${d.shortId}`,
            value: d.shortId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_select_draft_to_manage_players')
            .setPlaceholder('Selecciona un draft para gestionar sus jugadores')
            .addOptions(draftOptions);

        await interaction.editReply({
            content: 'Por favor, selecciona el draft del que deseas gestionar los jugadores:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }
    // --- NUEVO CÓDIGO PARA LOS BOTONES DE CONFIGURACIÓN DE DRAFT ---
// --- CÓDIGO MEJORADO PARA LOS BOTONES DE CONFIGURACIÓN DE DRAFT ---
if (action === 'admin_config_draft_min_quotas' || action === 'admin_config_draft_max_quotas') {
    const settings = await getBotSettings();
    const isMin = action === 'admin_config_draft_min_quotas';
    const modal = new ModalBuilder()
        .setCustomId(isMin ? 'config_draft_min_modal' : 'config_draft_max_modal')
        .setTitle(isMin ? 'Config: Mínimos por Posición' : 'Config: Máximos por Posición');
    
    // Buscamos las cuotas guardadas
    let valueForForm = isMin ? settings.draftMinQuotas : settings.draftMaxQuotas;

    // Si no hay nada guardado, creamos la plantilla por defecto
    if (!valueForForm) {
        valueForForm = Object.keys(DRAFT_POSITIONS).map(pos => `${pos}:`).join(',');
    }

    const quotasInput = new TextInputBuilder()
        .setCustomId('quotas_input')
        .setLabel("Formato: POS:Num,POS:Num (Ej: GK:1,DFC:2)")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(valueForForm) // Usamos el valor guardado o la plantilla
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(quotasInput));
    await interaction.showModal(modal);
    return;
}
// --- FIN DEL CÓDIGO MEJORADO ---
// --- FIN DEL NUEVO CÓDIGO ---

    if (action === 'captain_manage_roster_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (isAdmin) {
            const teamOptions = draft.captains.map(c => ({
                label: c.teamName,
                description: `Capitán: ${c.userName}`,
                value: c.userId
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_select_team_to_manage:${draftShortId}`)
                .setPlaceholder('Selecciona un equipo para gestionar')
                .addOptions(teamOptions);

            await interaction.editReply({
                content: 'Como administrador, puedes seleccionar cualquier equipo para gestionar su plantilla:',
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
        } else {
            const captain = draft.captains.find(c => c.userId === interaction.user.id);
            if (!captain) {
                return interaction.editReply({ content: 'No eres capitán en este draft.' });
            }
            const teamPlayers = draft.players.filter(p => p.captainId === captain.userId);
            const rosterEmbed = createTeamRosterManagementEmbed(captain, teamPlayers, draftShortId);
            await interaction.editReply(rosterEmbed);
        }
        return;
    }

    if (action === 'captain_dm_player') {
        const [playerId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`captain_dm_player_modal:${playerId}`)
            .setTitle('Enviar Mensaje Directo');
        const messageInput = new TextInputBuilder()
            .setCustomId('message_content')
            .setLabel("Contenido del Mensaje")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'captain_request_kick') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId, teamId, playerIdToKick] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        try {
            await requestPlayerKick(client, draft, teamId, playerIdToKick);
            await interaction.editReply({ content: '✅ Tu solicitud para expulsar al jugador ha sido enviada a los administradores para su revisión.' });
        } catch (error) {
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
        return;
    }
    
    if (action === 'admin_approve_kick' || action === 'admin_reject_kick') {
        await interaction.deferUpdate();
        const [draftShortId, captainId, playerIdToKick] = params;
        const wasApproved = action === 'admin_approve_kick';

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const result = await handleKickApproval(client, draft, captainId, playerIdToKick, wasApproved);

        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        if (wasApproved) {
            originalEmbed.setColor('#2ecc71').setFooter({ text: `Expulsión aprobada por ${interaction.user.tag}` });
        } else {
            originalEmbed.setColor('#e74c3c').setFooter({ text: `Expulsión rechazada por ${interaction.user.tag}` });
        }
        
        await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
        await interaction.followUp({ content: `✅ ${result.message}`, flags: [MessageFlags.Ephemeral] });
        return;
    }
    
    if (action === 'admin_invite_replacement_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId, teamId, kickedPlayerId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        const freeAgents = draft.players.filter(p => !p.captainId && !p.isCaptain);
        if (freeAgents.length === 0) {
            return interaction.editReply({ content: 'No hay agentes libres disponibles para invitar.' });
        }

        const agentOptions = freeAgents.map(p => ({
            label: p.psnId,
            description: `Pos: ${p.primaryPosition}`,
            value: p.userId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`captain_invite_replacement_select:${draftShortId}:${teamId}:${kickedPlayerId}`)
            .setPlaceholder('Selecciona un agente libre para invitar')
            .addOptions(agentOptions.slice(0, 25)); // Discord solo permite 25 opciones por menú

        await interaction.editReply({
            content: `Selecciona un jugador de la lista de agentes libres para invitarlo como reemplazo`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'draft_accept_replacement') {
        await interaction.deferUpdate();
        const [draftShortId, captainId, kickedPlayerId, replacementPlayerId] = params;

        if (interaction.user.id !== replacementPlayerId) {
            return interaction.followUp({ content: "Esta invitación no es para ti.", flags: [MessageFlags.Ephemeral] });
        }
        
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        await acceptReplacement(client, guild, draft, captainId, kickedPlayerId, replacementPlayerId);

        await interaction.editReply({
            content: '✅ Has aceptado la invitación y te has unido al equipo. Los botones de esta invitación han sido desactivados.',
            components: []
        });
        return;
    }

    if (action === 'draft_reject_replacement') {
        await interaction.deferUpdate();
        const [draftShortId, captainId] = params;
        const captain = await client.users.fetch(captainId).catch(() => null);

        if (captain) {
            await captain.send(`❌ El jugador ${interaction.user.tag} ha rechazado tu invitación para unirse a tu equipo.`);
        }

        await interaction.editReply({
            content: '❌ Has rechazado la invitación. Los botones han sido desactivados.',
            components: []
        });
        return;
    }

    if (action === 'captain_report_player') {
        const [draftShortId, teamId, playerId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`report_player_modal:${draftShortId}:${teamId}:${playerId}`)
            .setTitle('Reportar Jugador (Aplicar Strike)');
        const reasonInput = new TextInputBuilder()
            .setCustomId('reason_input')
            .setLabel("Razón del Strike")
            .setPlaceholder("Ej: Comportamiento tóxico, inactividad, etc.")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_remove_strike' || action === 'admin_pardon_player') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [playerId] = params;

        if (action === 'admin_remove_strike') {
            await removeStrike(client, playerId);
            await interaction.editReply({ content: '✅ Se ha quitado 1 strike al jugador.' });
        } else {
            await pardonPlayer(client, playerId);
            await interaction.editReply({ content: '✅ Se han perdonado todos los strikes del jugador.' });
        }
        
        return;
    }

    if (action === 'admin_force_kick_player') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId, teamId, playerIdToKick] = params;

        try {
            await forceKickPlayer(client, draftShortId, teamId, playerIdToKick);
            await interaction.editReply({ content: '✅ Jugador expulsado del equipo y devuelto a la lista de agentes libres.' });
        } catch (error) {
            console.error("Error al forzar expulsión de jugador:", error);
            await interaction.editReply({ content: `❌ Hubo un error: ${error.message}` });
        }
        return;
    }

    if (action === 'admin_create_draft_start') {
        const simpleModal = new ModalBuilder()
            .setCustomId('create_draft_modal')
            .setTitle('Crear Nuevo Draft');
        
        const nameInput = new TextInputBuilder()
            .setCustomId('draft_name_input')
            .setLabel("Nombre del Draft")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        simpleModal.addComponents(new ActionRowBuilder().addComponents(nameInput));

        await interaction.showModal(simpleModal);
        return;
    }

    if (action === 'register_draft_captain' || action === 'register_draft_player') {
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) return interaction.reply({ content: 'Error: No se encontró este draft.', flags: [MessageFlags.Ephemeral] });

        const userId = interaction.user.id;
        const isAlreadyRegistered = draft.captains.some(c => c.userId === userId) || 
                                  (draft.pendingCaptains && draft.pendingCaptains[userId]) ||
                                  draft.players.some(p => p.userId === userId) ||
                                  (draft.pendingPayments && draft.pendingPayments[userId]);
        if (isAlreadyRegistered) {
            return interaction.reply({ content: '❌ Ya estás inscrito, pendiente de aprobación o de pago en este draft.', flags: [MessageFlags.Ephemeral] });
        }
        
        const ruleStepContent = createRuleAcceptanceEmbed(1, 3, action, draftShortId);
        await interaction.reply(ruleStepContent);
        return;
    }

    if (action === 'draft_approve_captain' || action === 'draft_reject_captain') {
        await interaction.deferUpdate();
        const [draftShortId, targetUserId] = params;
        
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft || !draft.pendingCaptains || !draft.pendingCaptains[targetUserId]) {
            return interaction.followUp({ content: 'Error: Solicitud de capitán no encontrada o ya procesada.', flags: [MessageFlags.Ephemeral] });
        }

        const captainData = draft.pendingCaptains[targetUserId];
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        if (action === 'draft_approve_captain') {
            await approveDraftCaptain(client, draft, captainData);
            originalEmbed.setColor('#2ecc71').setFooter({ text: `Capitán aprobado por ${interaction.user.tag}` });
            await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
            await interaction.followUp({ content: '✅ Capitán aprobado y notificado.', flags: [MessageFlags.Ephemeral] });
        } else { // draft_reject_captain
            await db.collection('drafts').updateOne(
                { _id: draft._id },
                { $unset: { [`pendingCaptains.${targetUserId}`]: "" } }
            );

            try {
                const user = await client.users.fetch(targetUserId);
                await user.send(`❌ Tu solicitud para ser capitán en el draft **${draft.name}** ha sido rechazada.`);
            } catch (e) {
                console.warn(`No se pudo enviar MD de rechazo de draft al capitán ${targetUserId}.`);
            }

            originalEmbed.setColor('#e74c3c').setFooter({ text: `Solicitud rechazada por ${interaction.user.tag}` });
            await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
            await interaction.followUp({ content: '❌ Solicitud de capitán rechazada.', flags: [MessageFlags.Ephemeral] });
        }
        return;
    }
    
    if (action === 'admin_gestionar_participantes_draft') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    
        const allParticipants = [...draft.captains, ...draft.players.filter(p => !p.isCaptain)];
    
        if (allParticipants.length === 0) {
            return interaction.editReply({ content: 'ℹ️ No hay participantes inscritos para gestionar.' });
        }
    
        const pageSize = 25;
        if (allParticipants.length > pageSize) {
            const pageCount = Math.ceil(allParticipants.length / pageSize);
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                const start = i * pageSize + 1;
                const end = Math.min((i + 1) * pageSize, allParticipants.length);
                pageOptions.push({
                    label: `Página ${i + 1} (${start}-${end})`,
                    value: `page_${i}`,
                });
            }

            const pageMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_kick_participant_page_select:${draftShortId}`)
                .setPlaceholder('Selecciona una página de participantes')
                .addOptions(pageOptions);

            await interaction.editReply({
                content: `Hay demasiados participantes para mostrarlos todos. Por favor, selecciona una página`,
                components: [new ActionRowBuilder().addComponents(pageMenu)]
            });

        } else {
            const options = allParticipants.map(p => {
                const isCaptain = draft.captains.some(c => c.userId === p.userId);
                return {
                    label: p.userName || p.psnId,
                    description: isCaptain ? `CAPITÁN - ${p.psnId}` : `JUGADOR - ${p.psnId}`,
                    value: p.userId,
                    emoji: isCaptain ? '👑' : '👤'
                };
            });
    
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_kick_participant_draft_select:${draftShortId}`)
                .setPlaceholder('Selecciona un participante para expulsar')
                .addOptions(options);
            
            await interaction.editReply({
                content: 'Selecciona un participante de la lista para expulsarlo del draft. Esta acción es irreversible.',
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
        }
        return;
    }
    
    if (action === 'admin_unregister_draft_approve') {
        await interaction.deferUpdate();
        const [draftShortId, userId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        
        await approveUnregisterFromDraft(client, draft, userId);
        
        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        originalEmbed.setColor('#2ecc71').setFooter({ text: `Baja aprobada por ${interaction.user.tag}` });
        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ embeds: [originalEmbed], components: [disabledRow] });

        await interaction.followUp({ content: `✅ Baja del jugador procesada.`, flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'admin_unregister_draft_reject') {
        await interaction.deferUpdate();
        const [draftShortId, userId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        
        try {
            const user = await client.users.fetch(userId);
            await user.send(`❌ Tu solicitud de baja del draft **${draft.name}** ha sido **rechazada**.`);
        } catch(e) { console.warn('No se pudo notificar al usuario de la baja de draft rechazada'); }

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        originalEmbed.setColor('#e74c3c').setFooter({ text: `Baja rechazada por ${interaction.user.tag}` });
        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ embeds: [originalEmbed], components: [disabledRow] });

        await interaction.followUp({ content: `❌ Solicitud de baja rechazada.`, flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'draft_add_test_players') {
        const [draftShortId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`add_draft_test_players_modal:${draftShortId}`)
            .setTitle('Añadir Jugadores de Prueba');
            
        const amountInput = new TextInputBuilder()
            .setCustomId('amount_input')
            .setLabel("¿Cuántos jugadores de prueba quieres añadir?")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue('1');
            
        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'draft_simulate_picks') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        try {
            await simulateDraftPicks(client, draftShortId);
            await interaction.editReply('✅ Simulación completada. El draft ha finalizado.');
        } catch (error) {
            console.error('Error al simular picks del draft:', error);
            await interaction.editReply(`❌ Hubo un error durante la simulación: ${error.message}`);
        }
        return;
    }
    
    if (action === 'draft_force_tournament') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;

        const eightTeamFormats = Object.entries(TOURNAMENT_FORMATS)
            .filter(([key, format]) => format.size === 8)
            .map(([key, format]) => ({
                label: format.label,
                description: format.description,
                value: key
            }));

        if (eightTeamFormats.length === 0) {
            return interaction.editReply('❌ No hay formatos de torneo de 8 equipos configurados. No se puede continuar.');
        }

        const formatMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_create_tournament_format:${draftShortId}`)
            .setPlaceholder('Selecciona el formato para el torneo resultante')
            .addOptions(eightTeamFormats);
        
        await interaction.editReply({
            content: 'Por favor, elige el formato que tendrá el torneo que se creará a partir de este draft:',
            components: [new ActionRowBuilder().addComponents(formatMenu)],
        });
        return;
    }

    if (action === 'draft_payment_confirm_start') {
        const [draftShortId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`draft_payment_confirm_modal:${draftShortId}`)
            .setTitle('Confirmar Pago del Draft');

        const paypalInput = new TextInputBuilder().setCustomId('user_paypal_input').setLabel("Tu PayPal (para verificar el pago)").setStyle(TextInputStyle.Short).setPlaceholder('tu.email@ejemplo.com').setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'draft_approve_payment' || action === 'draft_reject_payment') {
        await interaction.deferUpdate();
        const [draftShortId, targetUserId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const pendingData = draft.pendingPayments[targetUserId];

        if (!pendingData) {
            return interaction.followUp({ content: 'Este usuario ya no tiene un pago pendiente.', flags: [MessageFlags.Ephemeral] });
        }
        
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        const user = await client.users.fetch(targetUserId);

        if (action === 'draft_approve_payment') {
            let updateQuery = { $push: { players: pendingData.playerData } };
            if (pendingData.captainData) {
                updateQuery.$push.captains = pendingData.captainData;
            }
            await db.collection('drafts').updateOne({ _id: draft._id }, updateQuery);
            await db.collection('drafts').updateOne({ _id: draft._id }, { $unset: { [`pendingPayments.${targetUserId}`]: "" } });

            originalEmbed.setColor('#2ecc71').setFooter({ text: `Pago aprobado por ${interaction.user.tag}` });
            await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
            
            try {
                await user.send(`✅ ¡Tu pago para el draft **${draft.name}** ha sido aprobado! Ya estás inscrito.`);
            } catch (e) { console.warn("No se pudo notificar al usuario de la aprobación del pago."); }
        } else { // draft_reject_payment
            await db.collection('drafts').updateOne({ _id: draft._id }, { $unset: { [`pendingPayments.${targetUserId}`]: "" } });

            originalEmbed.setColor('#e74c3c').setFooter({ text: `Pago rechazado por ${interaction.user.tag}` });
            await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
            
            try {
                await user.send(`❌ Tu pago para el draft **${draft.name}** ha sido rechazado. Por favor, contacta con un administrador.`);
            } catch(e) { console.warn("No se pudo notificar al usuario del rechazo del pago."); }
        }

        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        await updateDraftMainInterface(client, updatedDraft.shortId);
        await updatePublicMessages(client, updatedDraft);
        
        await interaction.followUp({ content: `La acción se ha completada.`, flags: [MessageFlags.Ephemeral] });
        return;
    }
    
    if (action === 'draft_start_selection') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        try {
            await startDraftSelection(client, guild, draftShortId);
            await interaction.editReply('✅ La fase de selección del draft ha comenzado.');
        } catch (error) {
            console.error('Error al iniciar la selección del draft:', error);
            await interaction.editReply(`❌ Hubo un error: ${error.message}`);
        }
        return;
    }
    
    if (action === 'draft_end') {
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) {
            return interaction.reply({ content: 'Error: No se pudo encontrar ese draft.', flags: [MessageFlags.Ephemeral] });
        }
        await interaction.reply({ content: `⏳ Recibido. Finalizando el draft **${draft.name}**. Los canales y mensajes se borrarán en breve.`, flags: [MessageFlags.Ephemeral] });
        await endDraft(client, draft);
        return;
    }

  if (action === 'captain_pick_start') {
    const [draftShortId] = params;
    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

    const currentCaptainId = draft.selection.order[draft.selection.turn];
    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (interaction.user.id !== currentCaptainId && !isAdmin) {
        return interaction.reply({ content: 'No es tu turno de elegir o no tienes permiso.', flags: [MessageFlags.Ephemeral] });
    }
    
    await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { "selection.isPicking": true } });
    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
    await updateCaptainControlPanel(client, updatedDraft);

    // --- INICIO DE LA MODIFICACIÓN ---
    // Ahora, en lugar de preguntar 'cómo buscar', directamente mostramos las posiciones a cubrir.
    const availablePlayers = draft.players.filter(p => !p.captainId);
    const availablePositions = new Set(availablePlayers.flatMap(p => [p.primaryPosition, p.secondaryPosition]));
    
    const positionOptions = Object.entries(DRAFT_POSITIONS)
        .filter(([key]) => availablePositions.has(key))
        .map(([key, value]) => ({ label: value, value: key }));

    if (positionOptions.length === 0) {
        return interaction.reply({ content: 'No hay jugadores disponibles para seleccionar.', flags: [MessageFlags.Ephemeral] });
    }

    const positionMenu = new StringSelectMenuBuilder()
        .setCustomId(`draft_pick_by_position:${draftShortId}:${currentCaptainId}`)
        .setPlaceholder('Elige la posición que quieres cubrir')
        .addOptions(positionOptions);
    
    const response = await interaction.reply({
        content: `**Turno de ${updatedDraft.captains.find(c => c.userId === currentCaptainId).teamName}**\nPor favor, elige la posición del jugador que quieres seleccionar`,
        components: [new ActionRowBuilder().addComponents(positionMenu)], 
        flags: [MessageFlags.Ephemeral]
    });
    // --- FIN DE LA MODIFICACIÓN ---

    await db.collection('drafts').updateOne({ _id: draft._id }, { $set: { "selection.activeInteractionId": response.id } });
    return;
}

    if (action === 'captain_cancel_pick') {
        await interaction.deferUpdate();
        const [draftShortId, targetCaptainId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        
        if (interaction.user.id !== targetCaptainId && !isAdmin) {
             return interaction.followUp({ content: 'No puedes cancelar una selección que no es tuya.', flags: [MessageFlags.Ephemeral] });
        }

        if (draft.selection.activeInteractionId) {
            try {
                await interaction.webhook.editMessage(draft.selection.activeInteractionId, {
                    content: '❌ Esta selección ha sido cancelada por el capitán.',
                    components: []
                });
            } catch (e) {
                console.warn(`No se pudo editar la interacción de selección cancelada: ${e.message}`);
            }
        }
        
        await db.collection('drafts').updateOne({ shortId: draftShortId }, { $set: { "selection.isPicking": false, "selection.activeInteractionId": null } });
        const updatedDraft = await db.collection('drafts').findOne({ shortId: draftShortId });
        await updateCaptainControlPanel(client, updatedDraft);
        return;
    }

   if (action === 'draft_confirm_pick') {
    const [draftShortId, captainId, selectedPlayerId] = params;
    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (interaction.user.id !== captainId && !isAdmin) {
        return interaction.reply({ content: 'No puedes confirmar este pick.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.update({
        content: '✅ Pick confirmado. Procesando siguiente turno...', 
        embeds: [],
        components: []
    });

    // --- INICIO DE LA MODIFICACIÓN ---
    try {
        // Intentamos procesar el fichaje y avanzar el turno
        await handlePlayerSelection(client, draftShortId, captainId, selectedPlayerId);
        await advanceDraftTurn(client, draftShortId);
    } catch (error) {
        // Si algo falla (ej. se supera el máximo), capturamos el error
        console.error(`Error de regla de negocio en el pick: ${error.message}`);
        // Y le mostramos el mensaje de error específico al capitán
        await interaction.followUp({
            content: `❌ **No se pudo completar el fichaje:** ${error.message}`,
            flags: [MessageFlags.Ephemeral]
        });
    }
    // --- FIN DE LA MODIFICACIÓN ---
    return;
}

    if (action === 'draft_undo_pick') {
        const [draftShortId, captainId] = params;
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if(interaction.user.id !== captainId && !isAdmin) {
            return interaction.reply({ content: 'No puedes deshacer este pick.', flags: [MessageFlags.Ephemeral] });
        }
        
        const searchTypeMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`draft_pick_search_type:${draftShortId}:${captainId}`)
                .setPlaceholder('Buscar jugador por...')
                .addOptions([
                    { label: 'Posición Primaria', value: 'primary', emoji: '⭐' },
                    { label: 'Posición Secundaria', value: 'secondary', emoji: '🔹' }
                ])
        );
        
        await interaction.update({
            content: 'Selección cambiada. Por favor, elige de nuevo cómo quieres buscar al jugador.',
            components: [searchTypeMenu]
        });
        return;
    }

    if (action === 'admin_toggle_translation') {
        await interaction.deferUpdate();
        const currentSettings = await getBotSettings();
        const newState = !currentSettings.translationEnabled;
        await updateBotSettings({ translationEnabled: newState });
        await updateAdminPanel(client); 
        await interaction.followUp({ content: `✅ La traducción automática ha sido **${newState ? 'ACTIVADA' : 'DESACTIVADA'}**.`, flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'admin_toggle_twitter') {
        await interaction.deferUpdate();
        const currentSettings = await getBotSettings();
        const newState = !currentSettings.twitterEnabled;
        await updateBotSettings({ twitterEnabled: newState });
        await updateAdminPanel(client); 
        await interaction.followUp({ content: `✅ La publicación automática en Twitter ha sido **${newState ? 'ACTIVADA' : 'DESACTIVADA'}**.`, flags: [MessageFlags.Ephemeral] });
        return;
    }

        if (action === 'rules_accept') {
        const [currentStepStr, originalAction, entityId] = params;
        const currentStep = parseInt(currentStepStr);
        
        const isCaptainFlow = originalAction.includes('captain');
        const isTournamentFlow = !originalAction.startsWith('register_draft');
        const totalSteps = isCaptainFlow || isTournamentFlow ? 3 : 1;
    
        if (currentStep >= totalSteps) {
            // --- INICIO DE LA MODIFICACIÓN ---
            if (originalAction.startsWith('register_draft_captain')) {
                // Para el capitán del draft, primero preguntamos la posición
                const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({
                    label: value, value: key
                }));
                const posMenu = new StringSelectMenuBuilder()
                    .setCustomId(`draft_register_captain_pos_select:${entityId}`)
                    .setPlaceholder('Selecciona tu posición PRIMARIA como Capitán')
                    .addOptions(positionOptions);

                await interaction.update({
                    content: 'Has aceptado las normas. Ahora, por favor, selecciona la posición en la que jugarás como capitán.',
                    components: [new ActionRowBuilder().addComponents(posMenu)],
                    embeds: []
                });

            } else if (isTournamentFlow) { // Flujo de torneo normal
                const platformButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`select_stream_platform:twitch:${originalAction}:${entityId}`).setLabel('Twitch').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`select_stream_platform:youtube:${originalAction}:${entityId}`).setLabel('YouTube').setStyle(ButtonStyle.Secondary)
                );
        
                await interaction.update({
                    content: 'Has aceptado las normas. Por favor, selecciona tu plataforma de transmisión principal.',
                    components: [platformButtons],
                    embeds: []
                });
            } else { // Player flow
                const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({
                    label: value, value: key
                }));
                const primaryPosMenu = new StringSelectMenuBuilder()
                    .setCustomId(`draft_register_player_pos_select_primary:${entityId}`)
                    .setPlaceholder('Paso 1: Selecciona tu posición PRIMARIA')
                    .addOptions(positionOptions);
    
                await interaction.update({
                    content: 'Has aceptado las normas. Ahora, por favor, selecciona tu posición primaria.',
                    components: [new ActionRowBuilder().addComponents(primaryPosMenu)],
                    embeds: []
                });
            }
            // --- FIN DE LA MODIFICACIÓN ---
        } else {
            const nextStepContent = createRuleAcceptanceEmbed(currentStep + 1, totalSteps, originalAction, entityId);
            await interaction.update(nextStepContent);
        }
        return;
    }
    if (action === 'select_stream_platform') {
        const [platform, originalAction, entityId, position] = params;
        const modal = new ModalBuilder();
        const usernameInput = new TextInputBuilder().setCustomId('stream_username_input').setLabel(`Tu usuario en ${platform.charAt(0).toUpperCase() + platform.slice(1)}`).setStyle(TextInputStyle.Short).setRequired(true);
        let finalActionId;
    
        if (originalAction.startsWith('register_draft_captain')) {
            finalActionId = `register_draft_captain_modal:${entityId}:${position}:${platform}`;
            modal.setTitle('Inscripción como Capitán de Draft');
            
            const teamNameInput = new TextInputBuilder().setCustomId('team_name_input').setLabel("Nombre de tu Equipo (3-12 caracteres)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(12).setRequired(true);
            const eafcNameInput = new TextInputBuilder().setCustomId('eafc_team_name_input').setLabel("Nombre de tu equipo dentro del EAFC").setStyle(TextInputStyle.Short).setRequired(true);
            const psnIdInput = new TextInputBuilder().setCustomId('psn_id_input').setLabel("Tu PSN ID / EA ID").setStyle(TextInputStyle.Short).setRequired(true);
            const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu Twitter (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(usernameInput),
                new ActionRowBuilder().addComponents(teamNameInput), 
                new ActionRowBuilder().addComponents(eafcNameInput),
                new ActionRowBuilder().addComponents(psnIdInput), 
                new ActionRowBuilder().addComponents(twitterInput)
            );
    
        } else { // Tournament Flow
            finalActionId = `inscripcion_modal:${entityId}:${platform}`;
            modal.setTitle('Inscripción de Equipo');
            
            const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (para el torneo)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(20).setRequired(true);
            const eafcNameInput = new TextInputBuilder().setCustomId('eafc_team_name_input').setLabel("Nombre de tu equipo dentro del EAFC").setStyle(TextInputStyle.Short).setRequired(true);
            const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu Twitter o el de tu equipo (Opcional)").setStyle(TextInputStyle.Short).setRequired(false);
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(usernameInput),
                new ActionRowBuilder().addComponents(teamNameInput), 
                new ActionRowBuilder().addComponents(eafcNameInput), 
                new ActionRowBuilder().addComponents(twitterInput)
            );
        }
    
        modal.setCustomId(finalActionId);
        await interaction.showModal(modal);
        return;
    }
    
    if (action === 'rules_reject') {
        await interaction.update({ content: 'Has cancelado el proceso de inscripción. Para volver a intentarlo, pulsa de nuevo el botón de inscripción.', components: [], embeds: [] });
        return;
    }
    
    if (action === 'inscribir_equipo_start' || action === 'inscribir_reserva_start') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
             return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] });
        }
        const captainId = interaction.user.id;
        const isAlreadyRegistered = tournament.teams.aprobados[captainId] || tournament.teams.pendientes[captainId] || (tournament.teams.reserva && tournament.teams.reserva[captainId]);
        if (isAlreadyRegistered) {
            return interaction.reply({ content: '❌ 🇪🇸 Ya estás inscrito o en la lista de reserva de este torneo.\n🇬🇧 You are already registered or on the waitlist for this tournament.', flags: [MessageFlags.Ephemeral] });
        }
        
        const ruleStepContent = createRuleAcceptanceEmbed(1, 3, action, tournamentShortId);
        await interaction.reply(ruleStepContent);
        return;
    }

        if (action === 'invite_to_thread') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [matchId, tournamentShortId] = params;
        // 1. Se obtiene la información más reciente del torneo.
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        // 2. Se busca la información del equipo directamente desde la fuente principal ("teams.aprobados")
        //    en lugar de la copia del partido.
        const team = tournament.teams.aprobados[interaction.user.id];

        // 3. Si por alguna razón el equipo no se encuentra, se da un error.
        if (!team) {
            return interaction.editReply({ content: 'Error: No se encontró tu equipo en este torneo.' });
        }

        // 4. Se llama a la misma función de antes, pero ahora "team" contiene la información actualizada.
        await inviteUserToMatchThread(interaction, team);
        return;
    }

      const modalActions = ['admin_modify_result_start', 'payment_confirm_start', 'admin_add_test_teams', 'admin_edit_tournament_start', 'report_result_start'];
    if (modalActions.includes(action)) {
        // --- INICIO DE LA MODIFICACIÓN ---
        // Primero, comprobamos los permisos si la acción es forzar resultado
        if (action === 'admin_modify_result_start') {
            // Comprobamos si el usuario tiene permiso de Administrador
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            // Comprobamos si el usuario tiene el rol de Árbitro
            const isReferee = interaction.member.roles.cache.has(ARBITRO_ROLE_ID);

            // Si NO es Administrador Y TAMPOCO es Árbitro, le denegamos el acceso.
            if (!isAdmin && !isReferee) {
                return interaction.reply({
                    content: '❌ No tienes permiso para usar esta función. Requiere ser Administrador o Árbitro.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
        }
        // --- FIN DE LA MODIFICACIÓN ---

        const [p1, p2] = params;
        
        const tournamentShortId = action.includes('report') || action.includes('admin_modify_result') ? p2 : p1;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] });
        }

        let modal;
        if (action === 'report_result_start') {
            const matchId = p1;
            const { partido } = findMatch(tournament, matchId);
            if (!partido) return interaction.reply({ content: 'Error: Partido no encontrado.', flags: [MessageFlags.Ephemeral] });
            modal = new ModalBuilder().setCustomId(`report_result_modal:${matchId}:${tournament.shortId}`).setTitle('Reportar Resultado');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        } else if (action === 'admin_modify_result_start') {
            const matchId = p1;
            const { partido } = findMatch(tournament, matchId);
            if (!partido) return interaction.reply({ content: 'Error: Partido no encontrado.', flags: [MessageFlags.Ephemeral] });
            modal = new ModalBuilder().setCustomId(`admin_force_result_modal:${matchId}:${tournament.shortId}`).setTitle('Forzar Resultado (Admin)');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        } else if (action === 'admin_add_test_teams') {
            modal = new ModalBuilder().setCustomId(`add_test_teams_modal:${tournamentShortId}`).setTitle('Añadir Equipos de Prueba');
            const amountInput = new TextInputBuilder().setCustomId('amount_input').setLabel("¿Cuántos equipos de prueba quieres añadir?").setStyle(TextInputStyle.Short).setRequired(true).setValue('1');
            modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        } else if (action === 'admin_edit_tournament_start') {
            modal = new ModalBuilder().setCustomId(`edit_tournament_modal:${tournamentShortId}`).setTitle(`Editar Torneo: ${tournament.nombre}`);
            const prizeCInput = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.config.prizeCampeon.toString());
            const prizeFInput = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.config.prizeFinalista.toString());
            const feeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Cuota de Inscripción (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.config.entryFee.toString());
            const startTimeInput = new TextInputBuilder().setCustomId('torneo_start_time').setLabel("Fecha/Hora de Inicio (ej: Sáb 20, 22:00 CET)").setStyle(TextInputStyle.Short).setRequired(false).setValue(tournament.config.startTime || '');
            modal.addComponents(new ActionRowBuilder().addComponents(prizeCInput), new ActionRowBuilder().addComponents(prizeFInput), new ActionRowBuilder().addComponents(feeInput), new ActionRowBuilder().addComponents(startTimeInput));
        } else if (action === 'payment_confirm_start') {
            modal = new ModalBuilder().setCustomId(`payment_confirm_modal:${tournamentShortId}`).setTitle('Confirmar Pago / Confirm Payment');
            const paypalInput = new TextInputBuilder().setCustomId('user_paypal_input').setLabel("Tu PayPal (para recibir premios)").setStyle(TextInputStyle.Short).setPlaceholder('tu.email@ejemplo.com').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
        }
        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_assign_cocaptain_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.editReply('Error: Torneo no encontrado.');
        }

        const teamsWithoutCoCaptain = Object.values(tournament.teams.aprobados).filter(team => !team.coCaptainId);

        if (teamsWithoutCoCaptain.length === 0) {
            return interaction.editReply('Todos los equipos de este torneo ya tienen un co-capitán o no hay equipos.');
        }

        const teamSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_assign_cocap_team_select:${tournamentShortId}`)
            .setPlaceholder('Paso 1: Selecciona el equipo')
            .addOptions(
                teamsWithoutCoCaptain.map(team => ({
                    label: team.nombre,
                    description: `Capitán: ${team.capitanTag}`,
                    value: team.capitanId, 
                }))
            );

        const row = new ActionRowBuilder().addComponents(teamSelectMenu);

        await interaction.editReply({
            content: 'Por favor, selecciona el equipo al que deseas asignarle un co-capitán:',
            components: [row],
        });
        return;
    }

    if (action === 'admin_update_channel_status') {
        const statusMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_set_channel_icon')
            .setPlaceholder('Selecciona el estado del canal manualmente')
            .addOptions([
                { label: 'Verde (Inscripciones Abiertas)', description: 'Hay torneos con plazas libres.', value: '🟢', emoji: '🟢' },
                { label: 'Azul (Torneos en Juego)', description: 'Hay torneos en progreso o llenos.', value: '🔵', emoji: '🔵' },
                { label: 'Rojo (Inactivo)', description: 'No hay torneos activos.', value: '🔴', emoji: '🔴' }
            ]);

        const row = new ActionRowBuilder().addComponents(statusMenu);

        await interaction.reply({
            content: 'Elige qué icono de estado quieres establecer para el canal de torneos:',
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }
    
    if (action === 'invite_cocaptain_start') {
        const [tournamentShortId] = params;
        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId(`invite_cocaptain_select:${tournamentShortId}`)
            .setPlaceholder('Busca y selecciona al usuario para invitar...')
            .setMinValues(1)
            .setMaxValues(1);
        
        const row = new ActionRowBuilder().addComponents(userSelectMenu);
        
        await interaction.reply({
            content: 'Selecciona al miembro del servidor que quieres invitar como co-capitán.',
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }
    
    if (action === 'admin_force_reset_bot') {
        const modal = new ModalBuilder().setCustomId('admin_force_reset_modal').setTitle('⚠️ CONFIRMAR RESET FORZOSO ⚠️');
        const warningText = new TextInputBuilder().setCustomId('confirmation_text').setLabel("Escribe 'CONFIRMAR RESET' para proceder").setStyle(TextInputStyle.Short).setPlaceholder('Esta acción es irreversible.').setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(warningText));
        await interaction.showModal(modal);
        return;
    }
    
    if (action === 'user_view_participants') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');

        const approvedTeams = Object.values(tournament.teams.aprobados);
        const waitlistedTeams = tournament.teams.reserva ? Object.values(tournament.teams.reserva) : [];

        let description = '🇪🇸 Aún no hay equipos inscritos.\n🇬🇧 No teams have registered yet.';

        if (approvedTeams.length > 0) {
            description = approvedTeams.map((team, index) => {
                let teamString = `${index + 1}. **${team.nombre}** (Cap: ${team.capitanTag}`;
                if (team.coCaptainTag) teamString += `, Co-Cap: ${team.coCaptainTag}`;
                teamString += `)`;
                return teamString;
            }).join('\n');
        }

        if (waitlistedTeams.length > 0) {
            const waitlistDescription = waitlistedTeams.map((team, index) => {
                 let teamString = `${index + 1}. **${team.nombre}** (Cap: ${team.capitanTag})`;
                 return teamString;
            }).join('\n');
            
            if(approvedTeams.length > 0) {
                description += `\n\n---\n`;
                description += `📋 **Lista de Reserva / Waitlist**\n${waitlistDescription}`;
            } else {
                description = `📋 **Lista de Reserva / Waitlist**\n${waitlistDescription}`;
            }
        }
        
        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`Participantes: ${tournament.nombre}`)
            .setDescription(description);

        try {
            await interaction.user.send({ embeds: [embed] });
            await interaction.editReply('✅ Te he enviado la lista de participantes por Mensaje Directo.');
        } catch (e) {
            await interaction.editReply('❌ No he podido enviarte un MD. Asegúrate de que tus mensajes directos no estén bloqueados.');
        }
        return;
    }

    if (action === 'request_referee') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [matchId] = params;
        const thread = interaction.channel;
        if (!thread.isThread()) return interaction.editReply('Esta acción solo funciona en un hilo de partido.');
        await thread.setName(`⚠️${thread.name.replace(/^[⚔️✅]-/g, '')}`.slice(0,100));
        await thread.send({ content: `🛎️ <@&${ARBITRO_ROLE_ID}> Se ha solicitado arbitraje en este partido por parte de <@${interaction.user.id}>.` });
        await interaction.editReply('✅ Se ha notificado a los árbitros y el hilo ha sido marcado para revisión.');
        return;
    }

    if (action === 'admin_change_format_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        const formatMenu = new StringSelectMenuBuilder().setCustomId(`admin_change_format_select:${tournamentShortId}`).setPlaceholder('Selecciona el nuevo formato').addOptions(Object.keys(TOURNAMENT_FORMATS).map(key => ({ label: TOURNAMENT_FORMATS[key].label, value: key })));
        const typeMenu = new StringSelectMenuBuilder().setCustomId(`admin_change_type_select:${tournamentShortId}`).setPlaceholder('Selecciona el nuevo tipo de pago').addOptions([ { label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' } ]);
        await interaction.editReply({ content: `**Editando:** ${tournament.nombre}\nSelecciona el nuevo formato o tipo.`, components: [new ActionRowBuilder().addComponents(formatMenu), new ActionRowBuilder().addComponents(typeMenu)], });
        return;
    }

    if (action === 'admin_create_tournament_start') {
        const formatMenu = new StringSelectMenuBuilder().setCustomId('admin_create_format').setPlaceholder('Paso 1: Selecciona el formato del torneo').addOptions(Object.keys(TOURNAMENT_FORMATS).map(key => ({ label: TOURNAMENT_FORMATS[key].label, value: key })));
        await interaction.reply({ content: 'Iniciando creación de torneo...', components: [new ActionRowBuilder().addComponents(formatMenu)], flags: [MessageFlags.Ephemeral] });
        return;
    }
    
    if (action === 'admin_undo_draw') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        await interaction.editReply({ content: '⏳ **Recibido.** Iniciando el proceso para revertir el sorteo. Esto puede tardar unos segundos...' });
        try {
            await undoGroupStageDraw(client, tournamentShortId);
            await interaction.followUp({ content: '✅ **Sorteo revertido con éxito!** El torneo está de nuevo en fase de inscripción.', flags: [MessageFlags.Ephemeral]});
        } catch (error) {
            console.error(`Error al revertir el sorteo para ${tournamentShortId}:`, error);
            await interaction.followUp({ content: `❌ Hubo un error al revertir el sorteo: ${error.message}`, flags: [MessageFlags.Ephemeral]});
        }
        return;
    }

    if (action === 'admin_approve') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || (!tournament.teams.pendientes[captainId] && !tournament.teams.reserva[captainId])) {
            return interaction.editReply({ content: 'Error: Solicitud no encontrada o ya procesada.' });
        }
        const teamData = tournament.teams.pendientes[captainId] || tournament.teams.reserva[captainId];
        await approveTeam(client, tournament, teamData);
        
        const kickButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_kick:${captainId}:${tournamentShortId}`).setLabel("Expulsar del Torneo / Kick from Tournament").setStyle(ButtonStyle.Danger));
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Aprobado por ${interaction.user.tag}`}).setColor('#2ecc71');
        
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        await originalMessage.edit({ embeds: [originalEmbed], components: [kickButton] });
        await interaction.editReply(`✅ Equipo aprobado y capitán notificado.`);
        return;
    }

    if (action === 'admin_reject') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [captainId, tournamentShortId] = params;
        let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const teamData = tournament.teams.pendientes[captainId] || tournament.teams.reserva[captainId];
        if (!tournament || !teamData) return interaction.editReply({ content: 'Error: Solicitud no encontrada o ya procesada.' });

        if (tournament.teams.pendientes[captainId]) delete tournament.teams.pendientes[captainId];
        if (tournament.teams.reserva && tournament.teams.reserva[captainId]) delete tournament.teams.reserva[captainId];
        
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { 'teams.pendientes': tournament.teams.pendientes, 'teams.reserva': tournament.teams.reserva }});
        
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`❌ 🇪🇸 Tu inscripción para el equipo **${teamData.nombre}** en el torneo **${tournament.nombre}** ha sido **rechazada**.\n🇬🇧 Your registration for the team **${teamData.nombre}** in the **${tournament.nombre}** tournament has been **rejected**.`);
        } catch (e) { console.warn(`No se pudo enviar MD de rechazo al usuario ${captainId}`); }
        
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Rechazado por ${interaction.user.tag}`}).setColor('#e74c3c');
        
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
        await interaction.editReply(`❌ Equipo rechazado y capitán notificado.`);
        return;
    }
    if (action === 'admin_kick') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        const teamData = tournament.teams.aprobados[captainId];
        if (!teamData) return interaction.editReply({ content: 'Error: Este equipo no estaba aprobado o ya fue expulsado.' });
        
        await kickTeam(client, tournament, captainId);
        
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`🚨 🇪🇸 Has sido **expulsado** del torneo **${tournament.nombre}** por un administrador.\n🇬🇧 You have sido **kicked** from the **${tournament.nombre}** tournament by an administrator.`);
        } catch (e) { console.warn(`No se pudo enviar MD de expulsión al usuario ${captainId}`); }
        
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Expulsado por ${interaction.user.tag}`}).setColor('#95a5a6');
        const originalButton = ButtonBuilder.from(originalMessage.components[0].components[0]);
        originalButton.setDisabled(true);
        const newActionRow = new ActionRowBuilder().addComponents(originalButton);
        await originalMessage.edit({ embeds: [originalEmbed], components: [newActionRow] });
        await interaction.editReply(`🚨 Equipo **${teamData.nombre}** expulsado y capitán notificado.`);
        return;
    }
    if (action === 'admin_force_draw') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        if (Object.keys(tournament.teams.aprobados).length < 2) return interaction.editReply({ content: 'Se necesitan al menos 2 equipos para forzar el sorteo.' });
        
        await interaction.editReply({ content: `✅ Orden recibida. El sorteo para **${tournament.nombre}** ha comenzado en segundo plano. Esto puede tardar varios minutos.` });
        
        startGroupStage(client, guild, tournament)
            .then(() => { if (interaction.channel) { interaction.channel.send(`🎲 ¡El sorteo para **${tournament.nombre}** ha finalizado y la Jornada 1 ha sido creada!`); } })
            .catch(error => { console.error("Error durante el sorteo en segundo plano:", error); if (interaction.channel) { interaction.channel.send(`❌ Ocurrió un error crítico durante el sorteo para **${tournament.nombre}**. Revisa los logs.`); } });
        return;
    }
    if (action === 'admin_simulate_matches') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        await interaction.editReply({ content: '⏳ Simulando todos los partidos pendientes... Esto puede tardar un momento.' });
        const result = await simulateAllPendingMatches(client, tournamentShortId);
        await interaction.editReply(`✅ Simulación completada. ${result.message}`);
        return;
    }
    if (action === 'admin_end_tournament') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: No se pudo encontrar ese torneo.' });
        await interaction.editReply({ content: `⏳ Recibido. Finalizando el torneo **${tournament.nombre}**. Los canales se borrarán en breve.` });
        await endTournament(client, tournament);
        return;
    }
    if (action === 'admin_notify_changes') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        const result = await notifyCaptainsOfChanges(client, tournament);
        await interaction.editReply(result.message);
        return;
    }
    
    if (action === 'cocaptain_accept') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, captainId, coCaptainId] = params;
        if (interaction.user.id !== coCaptainId) return interaction.editReply({ content: "Esta invitación no es para ti." });

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || !tournament.teams.coCapitanes[captainId] || tournament.teams.coCapitanes[captainId].invitedId !== coCaptainId) {
            return interaction.editReply({ content: "Esta invitación ya no es válida." });
        }
        
        await addCoCaptain(client, tournament, captainId, coCaptainId);
        
        const captainUser = await client.users.fetch(captainId);
        await captainUser.send(`✅ **${interaction.user.tag}** ha aceptado tu invitación y ahora es tu co-capitán.`);
        await interaction.editReply({ content: "✅ ¡Has aceptado la invitación! Ahora eres co-capitán." });

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ components: [disabledRow] });
    }

    if (action === 'cocaptain_reject') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, captainId, coCaptainId] = params;
        if (interaction.user.id !== coCaptainId) return interaction.editReply({ content: "Esta invitación no es para ti." });

        await db.collection('tournaments').updateOne({ shortId: tournamentShortId }, { $unset: { [`teams.coCapitanes.${captainId}`]: "" } });
        
        const captainUser = await client.users.fetch(captainId);
        await captainUser.send(`❌ **${interaction.user.tag}** ha rechazado tu invitación de co-capitán.`);
        await interaction.editReply({ content: "Has rechazado la invitación." });

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ components: [disabledRow] });
    }

    if (action === 'darse_baja_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: "Error: Torneo no encontrado." });

        const result = await requestUnregister(client, tournament, interaction.user.id);
        await interaction.editReply({ content: result.message });
    }

    if (action === 'darse_baja_draft_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) return interaction.editReply({ content: "Error: Draft no encontrado." });
    
        const result = await requestUnregisterFromDraft(client, draft, interaction.user.id);
        await interaction.editReply({ content: result.message });
    }
    
    if (action === 'admin_unregister_approve') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: "Error: Torneo no encontrado." });
        
        const team = tournament.teams.aprobados[captainId];
        if (!team) return interaction.editReply({ content: "Este equipo ya no está inscrito." });

        await kickTeam(client, tournament, captainId);
        
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`✅ Tu solicitud de baja del torneo **${tournament.nombre}** ha sido **aprobada**.`);
        } catch (e) { console.warn('No se pudo notificar al usuario de la baja aprobada'); }
        
        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        originalEmbed.setColor('#2ecc71').setFooter({ text: `Baja aprobada por ${interaction.user.tag}` });
        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ embeds: [originalEmbed], components: [disabledRow] });

        await interaction.editReply(`✅ Baja del equipo **${team.nombre}** procesada.`);
        return;
    }

    if (action === 'admin_unregister_reject') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`❌ Tu solicitud de baja del torneo **${tournament.nombre}** ha sido **rechazada** por un administrador.`);
        } catch(e) { console.warn('No se pudo notificar al usuario de la baja rechazada'); }

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        originalEmbed.setColor('#e74c3c').setFooter({ text: `Baja rechazada por ${interaction.user.tag}` });
        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ embeds: [originalEmbed], components: [disabledRow] });

        await interaction.editReply({ content: `❌ Solicitud de baja rechazada.`, flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'admin_prize_paid') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, userId, prizeType] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        await confirmPrizePayment(client, userId, prizeType, tournament);
        
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setTitle(`✅ PAGO REALIZADO: ${prizeType.toUpperCase()}`).setColor('#2ecc71').setFooter({text: `Marcado como pagado por ${interaction.user.tag}`});
        
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        
        await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
        await interaction.editReply(`✅ Pago marcado como realizado. Se ha notificado a <@${userId}>.`);
        return;
    }

    if(action === 'admin_manage_waitlist') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const waitlist = tournament.teams.reserva ? Object.values(tournament.teams.reserva) : [];
        if(waitlist.length === 0) {
            return interaction.editReply({content: 'La lista de reserva está vacía.'});
        }
        const options = waitlist.map(team => ({
            label: team.nombre,
            description: `Capitán: ${team.capitanTag}`,
            value: team.capitanId
        }));
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_promote_from_waitlist:${tournamentShortId}`)
            .setPlaceholder('Selecciona un equipo para promoverlo')
            .addOptions(options);
        
        await interaction.editReply({content: 'Selecciona un equipo de la lista de reserva para aprobarlo y añadirlo al torneo:', components: [new ActionRowBuilder().addComponents(selectMenu)]});
        return;
    }

    if (action === 'admin_promote_from_waitlist') { // This is a select menu interaction
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const selectedCaptainId = interaction.values[0]; // Get the selected captain ID

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.followUp({ content: 'Error: Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });
        }

        const teamData = tournament.teams.reserva[selectedCaptainId];
        if (!teamData) {
            return interaction.followUp({ content: 'Error: Equipo de reserva no encontrado.', flags: [MessageFlags.Ephemeral] });
        }

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`Gestionar Equipo de Reserva: ${teamData.nombre}`)
            .setDescription(`Capitán: ${teamData.capitanTag}\nEAFC: ${teamData.eafcTeamName}\nTwitter: ${teamData.twitter || 'N/A'}`);

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_promote_reserve_team:${tournamentShortId}:${selectedCaptainId}`)
                .setLabel('Promover al Torneo')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⬆️'),
            new ButtonBuilder()
                .setCustomId(`admin_message_reserve_team_start:${tournamentShortId}:${selectedCaptainId}`)
                .setLabel('Enviar Mensaje')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✉️')
        );

        await interaction.editReply({
            content: '¿Qué acción deseas realizar con este equipo de reserva?',
            embeds: [embed],
            components: [actionRow]
        });
        return;
    }

    if (action === 'admin_promote_reserve_team') {
        await interaction.deferUpdate();
        const [tournamentShortId, captainId] = params;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.followUp({ content: 'Error: Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });
        }

        const teamData = tournament.teams.reserva[captainId];
        if (!teamData) {
            return interaction.followUp({ content: 'Error: Equipo de reserva no encontrado.', flags: [MessageFlags.Ephemeral] });
        }

        // Call the approveTeam function to move the team from reserve to approved
        await approveTeam(client, tournament, teamData);

        // Disable the buttons on the original message
        const originalMessage = interaction.message;
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await originalMessage.edit({ components: [disabledRow] });

        await interaction.followUp({ content: `✅ El equipo **${teamData.nombre}** ha sido promovido al torneo.`, flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'admin_message_reserve_team_start') {
        const [tournamentShortId, captainId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`admin_message_reserve_team_modal:${tournamentShortId}:${captainId}`)
            .setTitle('Enviar Mensaje a Equipo de Reserva');

        const messageInput = new TextInputBuilder()
            .setCustomId('message_content')
            .setLabel("Contenido del Mensaje")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
        await interaction.showModal(modal);
        return;
    }
}
```

#### 2. `src/handlers/modalHandler.js` (Corrección de error de sintaxis)

```javascript
// src/handlers/modalHandler.js
import { getDb, updateBotSettings } from '../../database.js';
import { createNewTournament, updateTournamentConfig, updatePublicMessages, forceResetAllTournaments, addTeamToWaitlist, notifyCastersOfNewTeam, createNewDraft, approveDraftCaptain, updateDraftMainInterface, reportPlayer } from '../logic/tournamentLogic.js';
import { processMatchResult, findMatch, finalizeMatchThread } from '../logic/matchLogic.js';
import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, StringSelectMenuBuilder } from 'discord.js';
import { CHANNELS, ARBITRO_ROLE_ID, PAYMENT_CONFIG, DRAFT_POSITIONS } from '../../config.js';
import { updateTournamentManagementThread, updateDraftManagementPanel } from '../utils/panelManager.js';
import { createDraftStatusEmbed } from '../utils/embeds.js';

export async function handleModal(interaction) {
 // --- VARIABLES MOVIDAS AL PRINCIPIO ---
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    const [action, ...params] = customId.split(':');
    // --- FIN DE LAS VARIABLES MOVIDAS ---
    // --- CÓDIGO NUEVO PARA GUARDAR LA CONFIGURACIÓN DEL DRAFT ---
if (customId.startsWith('config_draft_')) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const quotas = interaction.fields.getTextInputValue('quotas_input');
    const isMin = customId.includes('min');
    
    // Aquí podrías añadir una validación para asegurar que el formato es correcto
    
    if (isMin) {
        await updateBotSettings({ draftMinQuotas: quotas });
        await interaction.editReply({ content: '✅ Se han actualizado las cuotas MÍNIMAS para iniciar un draft.' });
    } else {
        await updateBotSettings({ draftMaxQuotas: quotas });
        await interaction.editReply({ content: '✅ Se han actualizado las cuotas MÁXIMAS de jugadores por equipo.' });
    }
    return;
}
// --- FIN DEL CÓDIGO NUEVO ---
    

    if (action === 'report_player_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId, teamId, playerId] = params;
        const reason = interaction.fields.getTextInputValue('reason_input');
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        try {
            await reportPlayer(client, draft, interaction.user.id, teamId, playerId, reason);
            await interaction.editReply({ content: '✅ Tu reporte ha sido enviado y se ha añadido un strike al jugador.' });
        } catch (error) {
            console.error(error);
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
            return interaction.followUp({ content: '❌ No se encontró el draft.' });
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
                    userId: uniqueId, userName: `TestCaptain#${1000 + i}`, teamName: teamName,
                    streamChannel: 'https://twitch.tv/test', psnId: `Capi-Prueba-${currentCaptainCount + 1}`, eafcTeamName: `EAFC-Test-${currentCaptainCount + 1}`, twitter: 'test_captain', position: "DC"
                };
                
                const captainAsPlayerData = {
                    userId: uniqueId, userName: captainData.userName, psnId: captainData.psnId, twitter: captainData.twitter,
                    primaryPosition: captainData.position, secondaryPosition: captainData.position, currentTeam: teamName, isCaptain: true, captainId: null
                };
                bulkCaptains.push(captainData);
                bulkPlayers.push(captainAsPlayerData);
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
        await interaction.reply({ content: '⏳ Creando el draft de pago...', flags: [MessageFlags.Ephemeral] });
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
    
   // --- PEGA ESTE BLOQUE DE CÓDIGO COMPLETO ---
if (action === 'register_draft_captain_modal' || action === 'register_draft_player_modal') {
    await interaction.reply({ content: '⏳ Procesando tu inscripción...', flags: [MessageFlags.Ephemeral] });
    
    const isRegisteringAsCaptain = action.includes('captain');
    let draftShortId, position, primaryPosition, secondaryPosition, teamStatus, streamPlatform;

    if (isRegisteringAsCaptain) {
        // Recogemos la 'position' que el capitán eligió en los pasos anteriores
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

        // Guardamos los datos del capitán y su ficha de jugador con la posición correcta
        captainData = { userId, userName: interaction.user.tag, teamName, eafcTeamName, streamChannel, psnId, twitter, position };
        playerData = { userId, userName: interaction.user.tag, psnId, twitter, primaryPosition: position, secondaryPosition: 'NONE', currentTeam: teamName, isCaptain: true, captainId: userId };
    
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

        const embedDm = new EmbedBuilder()
            .setTitle(`💸 Inscripción al Draft Pendiente de Pago: ${draft.name}`)
            .setDescription(`Para confirmar tu plaza, realiza el pago de **${draft.config.entryFee}€**.\n\n**Pagar a / Pay to:**\n\`${PAYMENT_CONFIG.PAYPAL_EMAIL}\`\n\nUna vez realizado, pulsa el botón de abajo.`)
            .setColor('#e67e22');
            
        const confirmButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`draft_payment_confirm_start:${draftShortId}`).setLabel('✅ Ya he Pagado / I Have Paid').setStyle(ButtonStyle.Success));
        try {
            await interaction.user.send({ embeds: [embedDm], components: [confirmButton] });
            await interaction.editReply('✅ ¡Inscripción recibida! Revisa tus Mensajes Directos para completar el pago.');
        } catch (e) {
            await interaction.editReply('❌ No he podido enviarte un MD. Por favor, abre tus MDs y vuelve a intentarlo.');
        }
    } else {
        if (isRegisteringAsCaptain) {
            // Guardamos la info del capitán y su ficha de jugador para que un admin los apruebe
            await db.collection('drafts').updateOne(
                { _id: draft._id },
                { $set: { [`pendingCaptains.${userId}`]: captainData, [`pendingPlayers.${userId}`]: playerData } }
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
            const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`draft_approve_captain:${draftShortId}:${userId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`draft_reject_captain:${draftShortId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
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
// --- FIN DEL BLOQUE PEGADO ---
    
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
        const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`draft_approve_payment:${draftShortId}:${userId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`draft_reject_payment:${draftShortId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        
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
        await interaction.reply({ content: '⏳ Creando el torneo, por favor espera...', flags: [MessageFlags.Ephemeral] });
        
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
        
        const result = await createNewTournament(client, guild, nombre, shortId, config);

        if (result.success) {
            await interaction.editReply({ content: `✅ ¡Éxito! El torneo **"${nombre}"** ha sido creado.` });
        } else {
            console.error("Error capturado por el handler al crear el torneo:", result.message);
            await interaction.editReply({ content: `❌ Ocurrió un error al crear el torneo: ${result.message}` });
        }
        return;
    }

    if (action === 'edit_tournament_modal') {
        await interaction.reply({ content: '⏳ Actualizando configuración...', flags: [MessageFlags.Ephemeral] });
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
        await interaction.reply({ content: '⏳ Procesando tu inscripción...', flags: [MessageFlags.Ephemeral] });
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
            const embedDm = new EmbedBuilder().setTitle(`💸 Inscripción Pendiente de Pago: ${tournament.nombre}`).setDescription(`🇪🇸 ¡Casi listo! Para confirmar tu plaza, realiza el pago.\n🇬🇧 Almost there! To confirm your spot, please complete the payment.`).addFields({ name: 'Entry', value: `${tournament.config.entryFee}€` }, { name: 'Pagar a / Pay to', value: `\`${PAYMENT_CONFIG.PAYPAL_EMAIL}\`` }, { name: 'Instrucciones / Instructions', value: '🇪🇸 1. Realiza el pago.\n2. Pulsa el botón de abajo para confirmar.\n\n🇬🇧 1. Make the payment.\n2. Press the button below to confirm.' }).setColor('#e67e22');
            const confirmButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`payment_confirm_start:${tournamentShortId}`).setLabel('✅ He Pagado / I Have Paid').setStyle(ButtonStyle.Success));
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
        await interaction.reply({ content: '⏳ Notificando tu pago...', flags: [MessageFlags.Ephemeral] });
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
                await interaction.channel.send({ content: `🚨 <@&${ARBITRO_ROLE_ID}> ¡Resultados no coinciden para el partido **${partido.equipoA.nombre} vs ${partido.equipoB.nombre}**!\n- <@${reporterId}> ha reportado: \`${reportedResult}\`\n- <@${opponentId}> ha reportado: \`${opponentReport}\` `});
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

    if (action === 'admin_message_reserve_team_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, captainId] = params;
        const messageContent = interaction.fields.getTextInputValue('message_content');

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        }

        const teamData = tournament.teams.reserva[captainId];
        if (!teamData) {
            return interaction.editReply({ content: 'Error: Equipo de reserva no encontrado.' });
        }

        try {
            const user = await client.users.fetch(captainId);
            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`✉️ Mensaje del Staff sobre el Torneo: ${tournament.nombre}`)
                .setDescription(messageContent)
                .setTimestamp();
            
            await user.send({ embeds: [embed] });
            await interaction.editReply({ content: `✅ Mensaje enviado a **${teamData.nombre}** (Capitán: ${teamData.capitanTag}).` });
        } catch (e) {
            console.error(`Error al enviar mensaje al capitán ${captainId}:`, e);
            await interaction.editReply({ content: '❌ No se pudo enviar el mensaje. Es posible que el usuario tenga los MDs bloqueados.' });
        }
        return;
    }
}
