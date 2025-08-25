// --- INICIO DEL ARCHIVO buttonHandler.js (VERSIÓN FINAL Y COMPLETA) ---

import mongoose from 'mongoose';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, PermissionsBitField } from 'discord.js';
import { getDb, getBotSettings, updateBotSettings } from '../../database.js';
import { TOURNAMENT_FORMATS, ARBITRO_ROLE_ID, DRAFT_POSITIONS, PAYMENT_CONFIG, VERIFIED_ROLE_ID } from '../../config.js';
import Team from '../../src/models/team.js'; 
import {
    approveTeam, startGroupStage, endTournament, kickTeam, notifyCaptainsOfChanges, requestUnregister,
    addCoCaptain, undoGroupStageDraw, startDraftSelection, advanceDraftTurn, confirmPrizePayment,
    approveDraftCaptain, endDraft, simulateDraftPicks, handlePlayerSelection, requestUnregisterFromDraft,
    approveUnregisterFromDraft, updateCaptainControlPanel, requestPlayerKick, handleKickApproval,
    forceKickPlayer, removeStrike, pardonPlayer, acceptReplacement
} from '../logic/tournamentLogic.js';
import {
    checkVerification, startVerificationWizard, showVerificationModal, startProfileUpdateWizard, approveProfileUpdate, rejectProfileUpdate, openProfileUpdateThread
} from '../logic/verificationLogic.js';
import { findMatch, simulateAllPendingMatches } from '../logic/matchLogic.js';
import { updateAdminPanel } from '../utils/panelManager.js';
import { createRuleAcceptanceEmbed, createDraftStatusEmbed, createTeamRosterManagementEmbed, createGlobalAdminPanel, createStreamerWarningEmbed } from '../utils/embeds.js';
import { setBotBusy } from '../../index.js';
import { updateMatchThreadName, inviteUserToMatchThread } from '../utils/tournamentUtils.js';

export async function handleButton(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    
    const [action, ...params] = customId.split(':');

	  // NUEVO: Botón de inicio que muestra los botones correctos
    if (action === 'start_verification_or_registration') {
        const [draftShortId] = params;
        const isVerified = await checkVerification(interaction.user.id);
        
        let row;
        let content;

        if (!isVerified) {
            content = 'Para participar, primero debes verificar tu cuenta. Este proceso solo se realiza una vez y sirve para todos los futuros drafts.';
            row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_start_manual')
                    .setLabel('✅ Verificar mi Cuenta')
                    .setStyle(ButtonStyle.Success)
            );
        } else {
            content = 'Tu cuenta ya está verificada. ¿Qué deseas hacer?';
            const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

            // Comprobamos si el usuario ya está inscrito para no mostrar los botones de inscripción
            const isAlreadyRegistered = draft.captains.some(c => c.userId === interaction.user.id) || 
                                      draft.players.some(p => p.userId === interaction.user.id) ||
                                      (draft.pendingCaptains && draft.pendingCaptains[interaction.user.id]) ||
                                      (draft.pendingPayments && draft.pendingPayments[interaction.user.id]);

            row = new ActionRowBuilder();
            if (!isAlreadyRegistered) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`register_draft_player:${draftShortId}`)
                        .setLabel('👤 Inscribirme como Jugador')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`register_draft_captain:${draftShortId}`)
                        .setLabel('👑 Inscribirme como Capitán')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`update_profile_start`)
                    .setLabel('🔄 Actualizar Perfil Verificado')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        return interaction.reply({
            content,
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });
    }

    // =======================================================
    // --- LÓGICA DE VERIFICACIÓN Y GESTIÓN DE PERFIL ---
    // =======================================================
    
    if (action === 'verify_start_manual') {
        const platformMenu = new StringSelectMenuBuilder()
            .setCustomId('verify_select_platform_manual')
            .setPlaceholder('Paso 1: Selecciona tu plataforma principal')
            .addOptions([
                { label: '🎮 PlayStation', value: 'psn' },
                { label: '🟩 Xbox', value: 'xbox' },
                { label: '🔹 PC (Steam)', value: 'steam' },
                { label: '🔸 PC (EA App)', value: 'ea_app' },
            ]);
        const row = new ActionRowBuilder().addComponents(platformMenu);
        return interaction.reply({
            content: "¡Hola! Vamos a iniciar tu verificación. Este proceso es manual y requiere que envíes una prueba a un administrador.",
            components: [row],
            ephemeral: true
        });
    }

    if (action === 'verify_show_modal') {
        const [platform] = params;
        await showVerificationModal(interaction, platform);
        return;
    }

    if (action === 'update_profile_start') {
        const isVerified = await checkVerification(interaction.user.id);
        if (!isVerified) {
            return interaction.reply({ content: 'Primero debes verificar tu cuenta para poder actualizarla. Usa el botón "Verificar Cuenta".', flags: [MessageFlags.Ephemeral] });
        }
        await startProfileUpdateWizard(interaction);
        return;
    }

    if (action === 'admin_approve_update' || action === 'admin_reject_update' || action === 'admin_open_thread') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permiso para realizar esta acción.', flags: [MessageFlags.Ephemeral] });
        }
        if (action === 'admin_approve_update') await approveProfileUpdate(interaction);
        if (action === 'admin_reject_update') await rejectProfileUpdate(interaction);
        if (action === 'admin_open_thread') await openProfileUpdateThread(interaction);
        return;
    }
    
    // =======================================================
    // --- LÓGICA ORIGINAL DEL BOT ---
    // =======================================================
    
    if (action === 'inscribir_equipo_start' || action === 'inscribir_reserva_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.editReply({ content: 'Error: No se encontró este torneo.' });
        }

        const managerId = interaction.user.id;
        
        const isAlreadyRegistered = tournament.teams.aprobados[managerId] || tournament.teams.pendientes[managerId] || (tournament.teams.reserva && tournament.teams.reserva[managerId]);
        if (isAlreadyRegistered) {
            return interaction.editReply({ content: '❌ Ya estás inscrito o en la lista de reserva de este torneo.' });
        }

        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.DATABASE_URL);
        }
        
        const team = await Team.findOne({ 
            $or: [{ managerId: managerId }, { captains: managerId }], 
            guildId: interaction.guildId 
        }).lean();

        if (!team) {
            return interaction.editReply({
                content: '❌ **No se encontró un equipo gestionado por ti.**\n\nPara inscribirte en un torneo, primero debes ser el mánager o capitán de un equipo registrado usando el bot de gestión principal.'
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('Confirmación de Inscripción Automática')
            .setDescription(`Hemos detectado que eres un líder del equipo **${team.name}**. ¿Deseas inscribirlo en el torneo **${tournament.nombre}** usando sus datos guardados?`)
            .setThumbnail(team.logoUrl)
            .setColor('Green')
            .setFooter({ text: 'No tendrás que rellenar ningún formulario.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_team_registration:${tournamentShortId}:${team._id}`)
                .setLabel('✅ Sí, Inscribir mi Equipo')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('cancel_registration')
                .setLabel('❌ Cancelar')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        return;
    }

    if (action === 'confirm_team_registration') {
        const [tournamentShortId, teamId] = params;
        
        // CORRECCIÓN: Pasamos 'register_team_from_db' como una palabra clave
        // y el teamId como un parámetro separado para evitar errores de 'split'.
        const originalAction = 'register_team_from_db'; 

        const platformButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`select_stream_platform:twitch:${originalAction}:${tournamentShortId}:${teamId}`).setLabel('Twitch').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`select_stream_platform:youtube:${originalAction}:${tournamentShortId}:${teamId}`).setLabel('YouTube').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({
            content: '✅ Equipo confirmado. Por favor, selecciona ahora tu plataforma de transmisión principal para los partidos del torneo.',
            embeds: [],
            components: [platformButtons]
        });
        return;
    }
	if (action === 'select_stream_platform') {
        const [platform, originalAction, entityId, position] = params;
        
        // Esta función crea el embed de advertencia que debería aparecer después
        const warningContent = createStreamerWarningEmbed(platform, originalAction, entityId, position);

        // Actualizamos la interacción para mostrar la advertencia
        await interaction.update(warningContent);
        return;
    }
	
    if (action === 'cancel_registration') {
        await interaction.update({ content: 'Inscripción cancelada.', embeds: [], components: [] });
        return;
    }
    
    if (action === 'streamer_warning_accept') {
        // CORRECCIÓN: Los parámetros ahora llegan limpios y en orden.
        const [platform, originalAction, entityId, teamIdOrPosition] = params;
        const modal = new ModalBuilder();
        const usernameInput = new TextInputBuilder().setCustomId('stream_username_input').setLabel(`Tu usuario en ${platform.charAt(0).toUpperCase() + platform.slice(1)}`).setStyle(TextInputStyle.Short).setRequired(true);

        let finalActionId;

        if (originalAction === 'register_team_from_db') {
            const tournamentShortId = entityId;
            const teamId = teamIdOrPosition; // Ahora el teamId llega correctamente
            finalActionId = `inscripcion_final_modal:${tournamentShortId}:${platform}:${teamId}`;
            modal.setTitle('Finalizar Inscripción (Stream)');
            modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));
        } else if (originalAction.startsWith('register_draft_captain')) {
            const position = teamIdOrPosition; // En el flujo de draft, aquí llega la posición
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
        } else {
            // Flujo antiguo (legado)
            finalActionId = `inscripcion_modal:${entityId}:${platform}`;
            modal.setTitle('Inscripción de Equipo');
            const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (para el torneo)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(20).setRequired(true);
            const eafcNameInput = new TextInputBuilder().setCustomId('eafc_team_name_input').setLabel("Nombre de tu equipo dentro del EAFC").setStyle(TextInputStyle.Short).setRequired(true);
            const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu Twitter o el de tu equipo (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
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
    if (action === 'admin_edit_team_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const approvedTeams = Object.values(tournament.teams.aprobados);

        if (approvedTeams.length === 0) {
            return interaction.editReply({ content: 'No hay equipos aprobados para editar.' });
        }

        const teamOptions = approvedTeams.map(team => ({
            label: team.nombre,
            description: `Capitán: ${team.capitanTag}`,
            value: team.capitanId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_edit_team_select:${tournamentShortId}`)
            .setPlaceholder('Selecciona el equipo que deseas editar')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: 'Por favor, selecciona un equipo de la lista para modificar sus datos:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }
    
    if (action.startsWith('admin_panel_')) {
        try {
            const view = action.split('_')[2];
            const panelContent = await createGlobalAdminPanel(view);
            await interaction.update(panelContent);
        } catch (error) {
            if (error.code !== 10062) {
                console.error("Error al actualizar el panel de admin:", error);
            }
        }
        return;
    }

    if (action === 'admin_manage_drafts_players') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const activeDrafts = await db.collection('drafts').find({ status: { $nin: ['finalizado', 'torneo_generado', 'cancelado'] } }).toArray();

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
    
    if (action === 'admin_config_draft_min_quotas' || action === 'admin_config_draft_max_quotas') {
        const settings = await getBotSettings();
        const isMin = action === 'admin_config_draft_min_quotas';
        const modal = new ModalBuilder()
            .setCustomId(isMin ? 'config_draft_min_modal' : 'config_draft_max_modal')
            .setTitle(isMin ? 'Config: Mínimos por Posición' : 'Config: Máximos por Posición');
        
        let valueForForm = isMin ? settings.draftMinQuotas : settings.draftMaxQuotas;

        if (!valueForForm) {
            valueForForm = Object.keys(DRAFT_POSITIONS).map(pos => `${pos}:`).join(',');
        }

        const quotasInput = new TextInputBuilder()
            .setCustomId('quotas_input')
            .setLabel("Formato: POS:Num,POS:Num (Ej: GK:1,DFC:2)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(valueForForm) 
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(quotasInput));
        await interaction.showModal(modal);
        return;
    }

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

        const freeAgents = draft.players.filter(p => !p.captainId && !p.isCaptain).sort((a, b) => a.psnId.localeCompare(b.psnId));
        if (freeAgents.length === 0) {
            return interaction.editReply({ content: 'No hay agentes libres disponibles para invitar.' });
        }

        const pageSize = 25;
        if (freeAgents.length > pageSize) {
            const pageCount = Math.ceil(freeAgents.length / pageSize);
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                const start = i * pageSize + 1;
                const end = Math.min((i + 1) * pageSize, freeAgents.length);
                pageOptions.push({
                    label: `Página ${i + 1} (${start}-${end})`,
                    value: `page_${i}`,
                });
            }

            const pageMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_invite_replacement_page_select:${draftShortId}:${teamId}:${kickedPlayerId}`)
                .setPlaceholder('Selecciona una página de agentes libres')
                .addOptions(pageOptions);

            await interaction.editReply({
                content: `Hay demasiados agentes libres para mostrarlos todos. Por favor, selecciona una página:`,
                components: [new ActionRowBuilder().addComponents(pageMenu)]
            });
        } else {
            const agentOptions = freeAgents.map(p => ({
                label: p.psnId,
                description: `Pos: ${p.primaryPosition}`,
                value: p.userId
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`captain_invite_replacement_select:${draftShortId}:${teamId}:${kickedPlayerId}`)
                .setPlaceholder('Selecciona un agente libre para invitar')
                .addOptions(agentOptions);

            await interaction.editReply({
                content: `Selecciona un jugador de la lista de agentes libres para invitarlo como reemplazo:`,
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
        }
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

		 const isVerified = await checkVerification(interaction.user.id);
    if (!isVerified) {
        return interaction.reply({ content: '❌ Debes verificar tu cuenta primero usando el botón "Verificar Cuenta".', flags: [MessageFlags.Ephemeral] });
    }
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
    
        const allParticipants = [...draft.captains, ...draft.players.filter(p => !p.isCaptain)].sort((a, b) => (a.userName || a.psnId).localeCompare(b.userName || b.psnId));
    
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
        const [draftShortId, captainId, selectedPlayerId, pickedForPosition] = params;
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (interaction.user.id !== captainId && !isAdmin) {
            return interaction.reply({ content: 'No puedes confirmar este pick.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.update({
            content: '✅ Pick confirmado. Procesando siguiente turno...', 
            embeds: [],
            components: []
        });

        try {
            await handlePlayerSelection(client, draftShortId, captainId, selectedPlayerId, pickedForPosition);
            await advanceDraftTurn(client, draftShortId);
        } catch (error) {
            console.error(`Error de regla de negocio en el pick: ${error.message}`);
            await interaction.followUp({
                content: `❌ **No se pudo completar el fichaje:** ${error.message}`,
                flags: [MessageFlags.Ephemeral]
            });
        }
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
            if (originalAction.startsWith('register_draft_captain')) {
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

            } else if (isTournamentFlow) {
                const platformButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`select_stream_platform:twitch:${originalAction}:${entityId}`).setLabel('Twitch').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`select_stream_platform:youtube:${originalAction}:${entityId}`).setLabel('YouTube').setStyle(ButtonStyle.Secondary)
                );
        
                await interaction.update({
                    content: 'Has aceptado las normas. Por favor, selecciona tu plataforma de transmisión principal.',
                    components: [platformButtons],
                    embeds: []
                });
            } else {
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
        } else {
            const nextStepContent = createRuleAcceptanceEmbed(currentStep + 1, totalSteps, originalAction, entityId);
            await interaction.update(nextStepContent);
        }
        return;
    }
    
    if (action === 'rules_reject') {
        await interaction.update({ content: 'Has cancelado el proceso de inscripción. Para volver a intentarlo, pulsa de nuevo el botón de inscripción.', components: [], embeds: [] });
        return;
    }
    
    if (action === 'invite_to_thread') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [matchId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        const team = tournament.teams.aprobados[interaction.user.id];

        if (!team) {
            return interaction.editReply({ content: 'Error: No se encontró tu equipo en este torneo.' });
        }

        await inviteUserToMatchThread(interaction, team);
        return;
    }

    const modalActions = ['admin_modify_result_start', 'payment_confirm_start', 'admin_add_test_teams', 'admin_edit_tournament_start', 'report_result_start'];
    if (modalActions.includes(action)) {
        if (action === 'admin_modify_result_start') {
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            const isReferee = interaction.member.roles.cache.has(ARBITRO_ROLE_ID);

            if (!isAdmin && !isReferee) {
                return interaction.reply({
                    content: '❌ No tienes permiso para usar esta función. Requiere ser Administrador o Árbitro.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
        }

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

    if (action === 'admin_promote_from_waitlist') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const selectedCaptainId = interaction.values[0];

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
        
        await approveTeam(client, tournament, teamData);

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
	if (action === 'claim_verification_ticket') {
        // CORRECCIÓN: Añadida comprobación de permisos
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ No tienes permisos para reclamar tickets.', flags: [MessageFlags.Ephemeral] });
        }
        
        await interaction.deferUpdate();
        const [channelId] = params;
        const db = getDb();
        const ticket = await db.collection('verificationtickets').findOne({ channelId, status: 'pending' });

        if (!ticket) {
            // CORRECCIÓN: ephemeral actualizado a flags
            return interaction.followUp({ content: '❌ Este ticket ya ha sido reclamado o cerrado.', flags: [MessageFlags.Ephemeral] });
        }

        await db.collection('verificationtickets').updateOne({ _id: ticket._id }, {
            $set: {
                status: 'claimed',
                claimedBy: interaction.user.id
            }
        });

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        originalEmbed.addFields({ name: 'Estado', value: `🟡 **Atendido por:** <@${interaction.user.id}>` });

        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_verification:${channelId}`)
                .setLabel('Aprobar Verificación')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`reject_verification_start:${channelId}`)
                .setLabel('Rechazar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

        await interaction.message.edit({ embeds: [originalEmbed], components: [actionButtons] });
    }

    if (action === 'approve_verification') {
        // CORRECCIÓN: Añadida comprobación de permisos
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ No tienes permisos para aprobar verificaciones.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferUpdate();
        const [channelId] = params;
        const db = getDb();
        const ticket = await db.collection('verificationtickets').findOne({ channelId });

        if (!ticket || ticket.status === 'closed') return;
        if (ticket.claimedBy !== interaction.user.id) {
             // CORRECCIÓN: ephemeral actualizado a flags
             return interaction.followUp({ content: `❌ Este ticket está siendo atendido por <@${ticket.claimedBy}>.`, flags: [MessageFlags.Ephemeral] });
        }

        // 1. Guardar en la base de datos de verificados
        await db.collection('verified_users').updateOne(
            { discordId: ticket.userId },
            { 
                $set: {
                    discordTag: (await client.users.fetch(ticket.userId)).tag,
                    gameId: ticket.gameId,
                    platform: ticket.platform,
                    twitter: ticket.twitter,
                    verifiedAt: new Date(),
                }
            },
            { upsert: true }
        );

        // 2. Asignar rol
        const guild = await client.guilds.fetch(ticket.guildId);
        const member = await guild.members.fetch(ticket.userId);
        const verifiedRole = await guild.roles.fetch(VERIFIED_ROLE_ID);
        if (member && verifiedRole) {
            await member.roles.add(verifiedRole);
        }

        // 3. Notificar al usuario
        try {
            await member.send('🎉 **¡Identidad Verificada con Éxito!** 🎉\nTu cuenta ha sido aprobada por un administrador. Ya puedes inscribirte en nuestros drafts.');
        } catch (e) {
            console.warn(`No se pudo enviar MD de aprobación al usuario ${ticket.userId}`);
        }

        // 4. Cerrar ticket
        await db.collection('verificationtickets').updateOne({ _id: ticket._id }, { $set: { status: 'closed' } });
        const channel = await client.channels.fetch(channelId);
        await channel.send(`✅ Verificación aprobada por <@${interaction.user.id}>. Este canal se cerrará en 10 segundos.`);
        
        // Desactivar botones en el mensaje original
        const originalMessage = interaction.message;
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        const finalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        finalEmbed.data.fields.find(f => f.name === 'Estado').value = `✅ **Aprobado por:** <@${interaction.user.id}>`;
        await originalMessage.edit({ embeds: [finalEmbed], components: [disabledRow] });
        
        setTimeout(() => channel.delete().catch(console.error), 10000);
    }

    if (action === 'reject_verification_start') {
        // CORRECCIÓN: Añadida comprobación de permisos
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ No tienes permisos para rechazar verificaciones.', flags: [MessageFlags.Ephemeral] });
        }

        const [channelId] = params;
        const db = getDb();
        const ticket = await db.collection('verificationtickets').findOne({ channelId });

        if (ticket.claimedBy !== interaction.user.id) {
            // CORRECCIÓN: ephemeral actualizado a flags
             return interaction.reply({ content: `❌ Este ticket está siendo atendido por <@${ticket.claimedBy}>.`, flags: [MessageFlags.Ephemeral] });
        }
        
        const reasonMenu = new StringSelectMenuBuilder()
            .setCustomId(`reject_verification_reason:${channelId}`)
            .setPlaceholder('Selecciona un motivo para el rechazo')
            .addOptions([
                { label: 'Inactividad del usuario', value: 'inactivity', description: 'El usuario no ha respondido o enviado pruebas.' },
                { label: 'Pruebas insuficientes', value: 'proof', description: 'La captura de pantalla no es válida o no es clara.' }
            ]);
        
        // CORRECCIÓN: ephemeral actualizado a flags
        return interaction.reply({
            content: 'Por favor, selecciona el motivo del rechazo.',
            components: [new ActionRowBuilder().addComponents(reasonMenu)],
            flags: [MessageFlags.Ephemeral]
        });
    }

    // --- NUEVO PANEL DE EDICIÓN PARA ADMINS ---

    if (action === 'admin_edit_verified_user_start') {
        // Esta lógica necesitará un modal y un user select, la añadiremos en los handlers correspondientes.
        const userSelect = new UserSelectMenuBuilder()
            .setCustomId('admin_edit_verified_user_select')
            .setPlaceholder('Selecciona al usuario que deseas editar');
        
        return interaction.reply({
            content: 'Por favor, selecciona al usuario verificado cuyo perfil quieres modificar.',
            components: [new ActionRowBuilder().addComponents(userSelect)],
            ephemeral: true
        });
    }
}
