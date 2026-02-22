// --- INICIO DEL ARCHIVO buttonHandler.js (VERSIÓN FINAL Y COMPLETA) ---

import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, PermissionsBitField } from 'discord.js';
import { ObjectId } from 'mongodb';
import { getDb, getBotSettings, updateBotSettings } from '../../database.js';
import { TOURNAMENT_FORMATS, ARBITRO_ROLE_ID, DRAFT_POSITIONS, PAYMENT_CONFIG, VERIFIED_ROLE_ID, ADMIN_APPROVAL_CHANNEL_ID, CHANNELS } from '../../config.js';
import {
    approveTeam, startGroupStage, endTournament, kickTeam, notifyCaptainsOfChanges, requestUnregister,
    addCoCaptain, undoGroupStageDraw, startDraftSelection, advanceDraftTurn, confirmPrizePayment,
    approveDraftCaptain, endDraft, simulateDraftPicks, handlePlayerSelection, requestUnregisterFromDraft,
    approveUnregisterFromDraft, updateCaptainControlPanel, requestPlayerKick, handleKickApproval,
    forceKickPlayer, removeStrike, pardonPlayer, acceptReplacement, prepareRouletteDraw, kickPlayerFromDraft, createNewTournament,
    handleImportedPlayers
} from '../logic/tournamentLogic.js';
import {
    checkVerification, startVerificationWizard, showVerificationModal, startProfileUpdateWizard, approveProfileUpdate, rejectProfileUpdate, openProfileUpdateThread
} from '../logic/verificationLogic.js';
import { findMatch, simulateAllPendingMatches } from '../logic/matchLogic.js';
import { updateAdminPanel } from '../utils/panelManager.js';
import { createRuleAcceptanceEmbed, createDraftStatusEmbed, createTeamRosterManagementEmbed, createGlobalAdminPanel, createStreamerWarningEmbed, createTournamentManagementPanel } from '../utils/embeds.js';
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
                    // --- MODIFICACIÓN CLAVE ---
                    // Ahora pasamos el ID del draft al siguiente paso
                    .setCustomId(`verify_start_manual:${draftShortId}`)
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
        // --- MODIFICACIÓN CLAVE ---
        // Capturamos el ID del draft que ahora viene en los parámetros
        const [draftShortId] = params;
        const platformMenu = new StringSelectMenuBuilder()
            // Y lo añadimos al customId del siguiente paso
            .setCustomId(`verify_select_platform_manual:${draftShortId}`)
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
        const [platform, draftShortId] = params;
        await showVerificationModal(interaction, platform, draftShortId);
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
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] });
        }



        // --- MODIFICACIÓN: TORNEOS DE PAGO (Flujo simplificado) ---
        if (tournament.config.isPaid) {
            const modal = new ModalBuilder()
                .setCustomId(`register_paid_team_modal:${tournamentShortId}`)
                .setTitle(`Inscripción: ${tournament.nombre.substring(0, 30)}`);

            const teamNameInput = new TextInputBuilder()
                .setCustomId('team_name_input')
                .setLabel("Nombre del Club EAFC")
                .setStyle(TextInputStyle.Short)
                .setMinLength(3)
                .setMaxLength(30)
                .setRequired(true);

            const streamLinkInput = new TextInputBuilder()
                .setCustomId('stream_link_input')
                .setLabel("Canal de Retransmisión (Opcional)")
                .setPlaceholder("Pega aquí el enlace a tu canal (Twitch/YouTube)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(teamNameInput),
                new ActionRowBuilder().addComponents(streamLinkInput)
            );

            await interaction.showModal(modal);
            return;
        }
        // --- FIN MODIFICACIÓN ---

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const managerId = interaction.user.id;

        const isAlreadyRegistered = tournament.teams.aprobados[managerId] || tournament.teams.pendientes[managerId] || (tournament.teams.reserva && tournament.teams.reserva[managerId]);
        if (isAlreadyRegistered) {
            return interaction.editReply({ content: '❌ Ya estás inscrito o en la lista de reserva de este torneo.' });
        }

        const team = await getDb('test').collection('teams').findOne({
            $or: [{ managerId: managerId }, { captains: managerId }],
            guildId: interaction.guildId
        });

        // --- INICIO DE LA MODIFICACIÓN: GUÍA DE INSCRIPCIÓN ---
        if (!team) {
            const embed = new EmbedBuilder()
                .setColor('#e74c3c') // Rojo de error
                .setTitle('❌ No eres Manager o Capitán de ningún equipo en el Discord')
                .setDescription('Para poder inscribirte en un torneo, primero debes ser **mánager o capitán** de un equipo **registrado en este Discord**.')
                .addFields(
                    {
                        name: '👉 Si eres el Mánager de tu equipo (y aún no lo has registrado):',
                        value: '1. Ve al canal #🏠・registra-equipo-o-unete.\n' +
                            '2. Usa el comando o botón para **Acciones de manager**.\n' +
                            '3. Sigue los pasos del sistema.\n' +
                            '4. Una vez registrado, vuelve aquí y pulsa de nuevo el botón de inscripción al torneo.'
                    },
                    {
                        name: '👉 Si eres Capitán o Jugador (y no el mánager):',
                        value: '1. Pídele al **mánager** de tu equipo que siga los pasos de arriba para registrar el club en el Discord.\n' +
                            '2. Una vez el equipo esté registrado, el mánager podrá **invitarte** o tú podrás **solicitar unirte** desde el canal #🏠・registra-equipo-o-unete .\n' +
                            '3. Cuando ya formes parte de la plantilla, el mánager podrá **ascenderte a capitán**.\n' +
                            '4. ¡Como capitán, ya podrás inscribir al equipo en torneos!'
                    }
                )
                .setFooter({ text: 'Este sistema asegura que todos los equipos y capitanes estén correctamente registrados.' });

            return interaction.editReply({ embeds: [embed] });
        }
        // --- FIN DE LA MODIFICACIÓN ---

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
        const [platform, originalAction, entityId, teamIdOrPosition] = params;
        const db = getDb();
        const verifiedData = await db.collection('verified_users').findOne({ discordId: interaction.user.id });

        const modal = new ModalBuilder();
        let finalActionId;

        // --- INICIO DE LA NUEVA LÓGICA MEJORADA ---

        // Flujo para Capitanes de Draft
        if (originalAction.startsWith('register_draft_captain')) {
            const position = teamIdOrPosition;
            const streamUsernameInput = new TextInputBuilder().setCustomId('stream_username_input').setLabel(`Tu usuario en ${platform.charAt(0).toUpperCase() + platform.slice(1)}`).setStyle(TextInputStyle.Short).setRequired(true);
            const teamNameInput = new TextInputBuilder().setCustomId('team_name_input').setLabel("Nombre de tu Equipo (3-12 caracteres)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(12).setRequired(true);
            const eafcNameInput = new TextInputBuilder().setCustomId('eafc_team_name_input').setLabel("Nombre de tu equipo dentro del EAFC").setStyle(TextInputStyle.Short).setRequired(true);

            // CASO 1: El usuario está verificado y YA TIENE WhatsApp.
            if (verifiedData && verifiedData.whatsapp) {
                finalActionId = `register_verified_draft_captain_modal:${entityId}:${position}:${platform}`;
                modal.setTitle('Inscripción de Capitán (Verificado)');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(streamUsernameInput),
                    new ActionRowBuilder().addComponents(teamNameInput),
                    new ActionRowBuilder().addComponents(eafcNameInput)
                );
            }
            // CASO 2: El usuario está verificado pero LE FALTA el WhatsApp.
            else if (verifiedData && !verifiedData.whatsapp) {
                // Usamos el mismo customId, pero añadimos los campos de WhatsApp al modal.
                finalActionId = `register_verified_draft_captain_modal:${entityId}:${position}:${platform}`;
                modal.setTitle('Inscripción (Falta WhatsApp)');
                const whatsappInput = new TextInputBuilder().setCustomId('whatsapp_input').setLabel("Tu WhatsApp (Ej: +34 123456789)").setStyle(TextInputStyle.Short).setRequired(true);
                const whatsappConfirmInput = new TextInputBuilder().setCustomId('whatsapp_confirm_input').setLabel("Confirma tu WhatsApp").setStyle(TextInputStyle.Short).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(streamUsernameInput),
                    new ActionRowBuilder().addComponents(teamNameInput),
                    new ActionRowBuilder().addComponents(eafcNameInput),
                    new ActionRowBuilder().addComponents(whatsappInput),
                    new ActionRowBuilder().addComponents(whatsappConfirmInput)
                );
            }
            // CASO 3: El usuario no está verificado (flujo original).
            else {
                finalActionId = `register_draft_captain_modal:${entityId}:${position}:${platform}`;
                modal.setTitle('Inscripción como Capitán de Draft');
                const psnIdInput = new TextInputBuilder().setCustomId('psn_id_input').setLabel("Tu PSN ID / EA ID").setStyle(TextInputStyle.Short).setRequired(true);
                const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu Twitter (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(streamUsernameInput),
                    new ActionRowBuilder().addComponents(teamNameInput),
                    new ActionRowBuilder().addComponents(eafcNameInput),
                    new ActionRowBuilder().addComponents(psnIdInput),
                    new ActionRowBuilder().addComponents(twitterInput)
                );
            }
        }
        // Flujo para Torneos Normales (no draft) - Esta parte no necesita cambios.
        else {
            const streamUsernameInput = new TextInputBuilder().setCustomId('stream_username_input').setLabel(`Tu usuario en ${platform.charAt(0).toUpperCase() + platform.slice(1)}`).setStyle(TextInputStyle.Short).setRequired(true);

            if (originalAction === 'register_team_from_db') {
                const tournamentShortId = entityId;
                const teamId = teamIdOrPosition;
                finalActionId = `inscripcion_final_modal:${tournamentShortId}:${platform}:${teamId}`;
                modal.setTitle('Finalizar Inscripción (Stream)');
                modal.addComponents(new ActionRowBuilder().addComponents(streamUsernameInput));
            } else {
                finalActionId = `inscripcion_modal:${entityId}:${platform}`;
                modal.setTitle('Inscripción de Equipo');
                const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (para el torneo)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(20).setRequired(true);
                const eafcNameInput = new TextInputBuilder().setCustomId('eafc_team_name_input').setLabel("Nombre de tu equipo dentro del EAFC").setStyle(TextInputStyle.Short).setRequired(true);
                const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu Twitter o el de tu equipo (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(streamUsernameInput),
                    new ActionRowBuilder().addComponents(teamNameInput),
                    new ActionRowBuilder().addComponents(eafcNameInput),
                    new ActionRowBuilder().addComponents(twitterInput)
                );
            }
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

    if (action === 'admin_manual_regenerate') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;

        try {
            const { regenerateGroupStage } = await import('../logic/tournamentLogic.js');
            await regenerateGroupStage(client, tournamentShortId);

            await interaction.editReply({
                content: '✅ **Calendario Regenerado**\nSe han aplicado todos los cambios y se han creado los nuevos hilos de partido.',
                components: []
            });
        } catch (error) {
            console.error(error);
            await interaction.editReply({
                content: `❌ Error al regenerar el calendario: ${error.message}`
            });
        }
        return;
    }

    if (action === 'admin_manual_swap_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        const groups = tournament.structure.grupos;
        const teamOptions = [];

        for (const [groupName, groupData] of Object.entries(groups)) {
            groupData.equipos.forEach(team => {
                teamOptions.push({
                    label: team.nombre,
                    description: `Grupo: ${groupName}`,
                    value: team.id,
                    emoji: '🛡️'
                });
            });
        }

        if (teamOptions.length < 2) {
            return interaction.editReply({ content: 'No hay suficientes equipos para intercambiar.' });
        }

        if (teamOptions.length > 25) {
            const groupOptions = Object.keys(groups).map(gName => ({
                label: gName,
                value: gName
            }));

            const groupMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_manual_swap_group_1:${tournamentShortId}`)
                .setPlaceholder('Paso 1: Selecciona el GRUPO del primer equipo')
                .addOptions(groupOptions);

            await interaction.editReply({
                content: '🔄 **Intercambio Manual de Equipos**\n\nHay muchos equipos, así que iremos paso a paso.\n**Paso 1:** Selecciona el grupo donde está el primer equipo que quieres mover.',
                components: [new ActionRowBuilder().addComponents(groupMenu)]
            });
            return;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_manual_swap_select_1:${tournamentShortId}`)
            .setPlaceholder('Selecciona el PRIMER equipo a cambiar')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: '🔄 **Intercambio Manual de Equipos**\n\nSelecciona el **primer equipo** que quieres mover:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_panel_manual_results') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const activeTournaments = await db.collection('tournaments').find({ status: { $ne: 'finalizado' } }).toArray();

        if (activeTournaments.length === 0) {
            return interaction.editReply({ content: 'No hay torneos activos para gestionar resultados.' });
        }

        const tournamentOptions = activeTournaments.map(t => ({
            label: t.nombre,
            description: `Estado: ${t.status} | ID: ${t.shortId}`,
            value: t.shortId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_select_tournament_manual_results')
            .setPlaceholder('Selecciona un torneo para gestionar resultados')
            .addOptions(tournamentOptions);

        await interaction.editReply({
            content: 'Selecciona el torneo donde quieres gestionar resultados manualmente:',
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
        const activeDrafts = await db.collection('drafts').find({ status: { $nin: ['cancelado'] } }).toArray();

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

    if (action === 'admin_edit_draft_captain_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        if (!draft.captains || draft.captains.length === 0) {
            return interaction.editReply({ content: 'No hay capitanes aprobados para editar.' });
        }

        const captainOptions = draft.captains.map(c => ({
            label: c.teamName,
            description: `Cap: ${c.userName}`,
            value: c.userId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_captain_to_edit:${draftShortId}`)
            .setPlaceholder('Selecciona el capitán que deseas editar')
            .addOptions(captainOptions);

        await interaction.editReply({
            content: 'Por favor, selecciona un capitán de la lista para modificar sus datos:',
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

    if (action === 'admin_add_player_manual_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;

        const { DRAFT_POSITIONS } = await import('../../config.js');
        const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({
            label: value,
            value: key,
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_manual_player_pos:${draftShortId}`)
            .setPlaceholder('Selecciona la posición PRINCIPAL del jugador')
            .addOptions(positionOptions);

        await interaction.editReply({
            content: 'Para inscribir a un jugador manualmente, primero selecciona su posición primaria:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_add_captain_manual_start') {
        const [draftShortId] = params;
        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`admin_add_cap_user_sel:${draftShortId}`)
            .setPlaceholder('Selecciona el Usuario de Discord');

        await interaction.reply({
            content: 'Para añadir un capitán manualmente, primero selecciona a su usuario de Discord:',
            components: [new ActionRowBuilder().addComponents(userSelect)],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    if (action === 'admin_edit_draft_config_start') {
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        const modal = new ModalBuilder()
            .setCustomId(`admin_edit_draft_modal:${draftShortId}`)
            .setTitle('Editar Configuración del Draft');

        const nameInput = new TextInputBuilder()
            .setCustomId('draft_name_input')
            .setLabel("Nombre del Draft")
            .setStyle(TextInputStyle.Short)
            .setValue(draft.name)
            .setRequired(true);

        const feeInput = new TextInputBuilder()
            .setCustomId('draft_fee_input')
            .setLabel("Entrada por jugador (€) (0 = Gratis)")
            .setStyle(TextInputStyle.Short)
            .setValue(draft.config.entryFee ? draft.config.entryFee.toString() : '0')
            .setRequired(true);

        const championPrizeInput = new TextInputBuilder()
            .setCustomId('draft_prize_champ_input')
            .setLabel("Premio Campeón (€)")
            .setStyle(TextInputStyle.Short)
            .setValue(draft.config.prizeCampeon ? draft.config.prizeCampeon.toString() : '0')
            .setRequired(true);

        const runnerupPrizeInput = new TextInputBuilder()
            .setCustomId('draft_prize_runnerup_input')
            .setLabel("Premio Finalista (€)")
            .setStyle(TextInputStyle.Short)
            .setValue(draft.config.prizeFinalista ? draft.config.prizeFinalista.toString() : '0')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(feeInput),
            new ActionRowBuilder().addComponents(championPrizeInput),
            new ActionRowBuilder().addComponents(runnerupPrizeInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (action === 'captain_pick_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (draft.status !== 'seleccion') {
            return interaction.editReply({ content: '❌ El draft no está en fase de selección.' });
        }

        const currentCaptainId = draft.selection.order[draft.selection.turn];
        if (interaction.user.id !== currentCaptainId && !isAdmin) {
            const currentCaptain = draft.captains.find(c => c.userId === currentCaptainId);
            return interaction.editReply({
                content: `❌ No es tu turno. Ahora le toca a **${currentCaptain ? currentCaptain.teamName : 'otro capitán'}**.`
            });
        }

        const { DRAFT_POSITIONS } = await import('../../config.js');
        const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({
            label: value,
            value: key,
        }));

        const positionMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_pick_by_position:${draftShortId}:${currentCaptainId}`)
            .setPlaceholder('Elige la posición que quieres cubrir')
            .addOptions(positionOptions);

        await interaction.editReply({
            content: `✅ **Es tu turno** (Pick #${draft.selection.currentPick}). Selecciona la posición del jugador que quieres fichar:`,
            components: [new ActionRowBuilder().addComponents(positionMenu)]
        });
        return;
    }

    if (action === 'draft_pick_page') {
        await interaction.deferUpdate();
        // params: draftShortId, captainId, selectedPosition, searchType, page
        const [draftShortId, captainId, selectedPosition, searchType, pageStr] = params;
        const page = parseInt(pageStr) || 0;
        const PAGE_SIZE = 25;
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        // Validar turno
        const currentTurnCaptainId = draft.selection.order[draft.selection.turn];
        if (captainId !== currentTurnCaptainId && !isAdmin) {
            return interaction.followUp({ content: '⏳ El turno ya cambió. Esta selección no es válida.', flags: [MessageFlags.Ephemeral] });
        }

        const { DRAFT_POSITIONS } = await import('../../config.js');
        const availablePlayers = draft.players.filter(p => !p.isCaptain && !p.captainId);

        let playersToShow = searchType === 'secondary'
            ? availablePlayers.filter(p => p.secondaryPosition === selectedPosition)
            : availablePlayers.filter(p => p.primaryPosition === selectedPosition);

        if (playersToShow.length === 0 && searchType !== 'secondary') {
            playersToShow = availablePlayers.filter(p => p.secondaryPosition === selectedPosition);
        }

        playersToShow.sort((a, b) => a.psnId.localeCompare(b.psnId));

        const totalPages = Math.ceil(playersToShow.length / PAGE_SIZE);
        const safePage = Math.max(0, Math.min(page, totalPages - 1));
        const pagePlayers = playersToShow.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

        const playerMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_pick_player:${draftShortId}:${captainId}:${selectedPosition}`)
            .setPlaceholder(`Página ${safePage + 1}/${totalPages} — Elige al jugador`)
            .addOptions(pagePlayers.map(player => ({
                label: player.psnId,
                description: `${player.userName} | ${player.currentTeam === 'Libre' ? '🔎 Agente Libre' : '🛡️ Con equipo'}`,
                value: player.userId,
            })));

        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`draft_pick_page:${draftShortId}:${captainId}:${selectedPosition}:${searchType}:${safePage - 1}`)
                .setLabel('← Anterior')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(safePage === 0),
            new ButtonBuilder()
                .setCustomId('draft_pick_page_info')
                .setLabel(`Página ${safePage + 1} de ${totalPages} (${playersToShow.length} jugadores)`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`draft_pick_page:${draftShortId}:${captainId}:${selectedPosition}:${searchType}:${safePage + 1}`)
                .setLabel('Siguiente →')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(safePage >= totalPages - 1)
        );

        await interaction.editReply({
            components: [new ActionRowBuilder().addComponents(playerMenu), navRow]
        });
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
        const [draftShortId, teamId, playerIdToKick] = params;
        const modal = new ModalBuilder()
            .setCustomId(`request_kick_modal:${draftShortId}:${teamId}:${playerIdToKick}`)
            .setTitle('Solicitar Expulsión de Jugador');
        const reasonInput = new TextInputBuilder()
            .setCustomId('reason_input')
            .setLabel("Motivo de la Expulsión")
            .setPlaceholder("Ej: Inactividad total, toxicidad, etc.")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
        return;
    }

    // --- BLOQUE NUEVO Y MEJORADO ---
    if (action === 'admin_approve_kick' || action === 'admin_reject_kick') {
        await interaction.deferUpdate();
        const [draftShortId, captainId, playerIdToKick] = params;
        const wasApproved = action === 'admin_approve_kick';

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const result = await handleKickApproval(client, draft, captainId, playerIdToKick, wasApproved);

        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);

        // --- LÓGICA MEJORADA PARA DESACTIVAR BOTONES ---
        // Creamos una nueva fila con botones idénticos pero desactivados
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('approve_kick_disabled')
                .setLabel('Aprobar Expulsión')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('reject_kick_disabled')
                .setLabel('Rechazar')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
        );
        // --- FIN DE LA LÓGICA MEJORADA ---

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

        const db = getDb();
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) {
            return interaction.editReply({ content: 'Error: No se pudo encontrar el draft.' });
        }

        const currentTeamPlayers = draft.players.filter(p => p.captainId === teamId);
        if (currentTeamPlayers.length >= 11) {
            return interaction.editReply({ content: '❌ Tu plantilla ya está completa (11 jugadores). No puedes invitar a más reemplazos.' });
        }

        const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({
            label: value,
            value: key
        }));

        const positionMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_replacement_position:${draftShortId}:${teamId}:${kickedPlayerId}`)
            .setPlaceholder('Paso 1: Selecciona la posición a cubrir')
            .addOptions(positionOptions);

        await interaction.editReply({
            content: 'Por favor, selecciona la posición del jugador que deseas buscar como reemplazo:',
            components: [new ActionRowBuilder().addComponents(positionMenu)]
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
            .setRequired(true)
            .setMaxLength(500);
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
        const playerRecord = await db.collection('player_records').findOne({ userId: interaction.user.id });

        if (playerRecord && playerRecord.strikes >= 3) {
            return interaction.reply({
                content: `❌ **Inscripción Bloqueada:** Tienes ${playerRecord.strikes} strikes acumulados. No puedes participar en nuevos drafts.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const isVerified = await checkVerification(interaction.user.id);
        if (!isVerified) {
            return interaction.reply({ content: '❌ Debes verificar tu cuenta primero usando el botón "Verificar Cuenta".', flags: [MessageFlags.Ephemeral] });
        }

        const [draftShortId, channelId] = params;
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

        // --- CORRECCIÓN CLAVE ---
        // Pasamos los parámetros en el orden correcto a la función.
        const originalActionWithContext = `${action}:${channelId || 'no-ticket'}`;
        const ruleStepContent = createRuleAcceptanceEmbed(1, 3, originalActionWithContext, draftShortId);
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

    if (action === 'admin_import_players_start') {
        const [draftShortId] = params;

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('📥 Importar Jugadores')
            .setDescription('Selecciona el método de importación:\n\n📝 **Pegar Texto:** Para listas pequeñas (hasta ~150 jugadores).\n📁 **Subir Archivo:** Para listas grandes (sin límite, archivo .txt).');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_import_players_text_start:${draftShortId}`).setLabel('Pegar Texto').setStyle(ButtonStyle.Primary).setEmoji('📝'),
            new ButtonBuilder().setCustomId(`admin_import_players_file_start:${draftShortId}`).setLabel('Subir Archivo (.txt)').setStyle(ButtonStyle.Secondary).setEmoji('📁')
        );

        await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'admin_import_players_text_start') {
        const [draftShortId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`admin_import_players_modal:${draftShortId}`)
            .setTitle('Importar Jugadores desde Texto');

        const listInput = new TextInputBuilder()
            .setCustomId('player_list_input')
            .setLabel("Pega la lista aquí (Formato: ID + WhatsApp)")
            .setPlaceholder("1. Jugador1 600123456\n2. Jugador2 +34600000000\n...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(listInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_import_players_file_start') {
        const [draftShortId] = params;
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        await interaction.editReply({
            content: '📁 **Por favor, sube ahora el archivo `.txt` con la lista de jugadores.**\n\nEl formato debe ser igual que en texto:\n`1. Jugador1 600123456`\n`2. Jugador2 +34600000000`\n\n⏳ Tienes 60 segundos para subir el archivo.',
            components: []
        });

        const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
        const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async m => {
            const attachment = m.attachments.first();
            if (!attachment.name.endsWith('.txt')) {
                await interaction.followUp({ content: '❌ El archivo debe ser un `.txt`. Inténtalo de nuevo.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            try {
                const response = await fetch(attachment.url);
                if (!response.ok) throw new Error('Error al descargar el archivo.');
                const text = await response.text();

                // Procesar el texto con la misma lógica que el modal
                const result = await handleImportedPlayers(client, draftShortId, text);

                if (result.success) {
                    const successEmbed = new EmbedBuilder()
                        .setColor('#2ecc71')
                        .setTitle('✅ Importación Completada (Archivo)')
                        .setDescription(result.message)
                        .addFields(
                            { name: 'Nuevos', value: `${result.stats.added}`, inline: true },
                            { name: 'Vinculados', value: `${result.stats.linked}`, inline: true },
                            { name: 'Externos', value: `${result.stats.external}`, inline: true },
                            { name: 'Mantenidos', value: `${result.stats.kept}`, inline: true },
                            { name: 'Eliminados', value: `${result.stats.removed}`, inline: true }
                        );
                    await interaction.followUp({ embeds: [successEmbed], flags: [MessageFlags.Ephemeral] });
                } else {
                    await interaction.followUp({ content: `❌ Error en la importación: ${result.message}`, flags: [MessageFlags.Ephemeral] });
                }

                // Intentar borrar el mensaje del usuario con el archivo para mantener limpieza
                try { await m.delete(); } catch (e) { /* Ignorar si no hay permisos */ }

            } catch (error) {
                console.error("Error procesando archivo de importación:", error);
                await interaction.followUp({ content: '❌ Ocurrió un error al procesar el archivo.', flags: [MessageFlags.Ephemeral] });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.followUp({ content: '⏱️ Se acabó el tiempo. No se detectó ningún archivo.', flags: [MessageFlags.Ephemeral] });
            }
        });
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

            const addPlayerButton = new ButtonBuilder()
                .setCustomId(`admin_add_participant_manual_start:${draftShortId}`)
                .setLabel('Añadir Jugador Manualmente')
                .setStyle(ButtonStyle.Success)
                .setEmoji('➕');

            await interaction.editReply({
                content: 'Selecciona un participante de la lista para expulsarlo, o usa el botón para añadir uno nuevo.',
                components: [
                    new ActionRowBuilder().addComponents(selectMenu),
                    new ActionRowBuilder().addComponents(addPlayerButton)
                ]
            });
        }
        return;
    }

    if (action === 'admin_add_participant_manual_start') {
        const [draftShortId] = params;
        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`admin_add_partic_user_sel:${draftShortId}`)
            .setPlaceholder('Selecciona el Usuario de Discord');

        const ghostButtonBtn = new ButtonBuilder()
            .setCustomId(`admin_add_ghost_partic_start:${draftShortId}`)
            .setLabel('Añadir Fantasma (Sin Discord)')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👻');

        await interaction.reply({
            content: 'Para añadir un participante manualmente, primero selecciona a su usuario de Discord. Si no tiene cuenta, añádele como Fantasma:',
            components: [
                new ActionRowBuilder().addComponents(userSelect),
                new ActionRowBuilder().addComponents(ghostButtonBtn)
            ],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    if (action === 'admin_add_ghost_partic_start') {
        const [draftShortId] = params;

        const modal = new ModalBuilder()
            .setCustomId(`admin_ghost_partic_submit:${draftShortId}`)
            .setTitle('Añadir Fantasma (Participante)');

        const gameIdInput = new TextInputBuilder()
            .setCustomId('ghost_game_id')
            .setLabel("ID de Juego (PSN/EA ID)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const whatsappInput = new TextInputBuilder()
            .setCustomId('ghost_whatsapp')
            .setLabel("WhatsApp (con prefijo, ej: +34)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const positionInput = new TextInputBuilder()
            .setCustomId('ghost_position')
            .setLabel("Posición (GK, DFC, CARR, MC, DC)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("DC")
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gameIdInput),
            new ActionRowBuilder().addComponents(whatsappInput),
            new ActionRowBuilder().addComponents(positionInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_add_ghost_plr_start') {
        const [draftShortId, position] = params;

        const modal = new ModalBuilder()
            .setCustomId(`admin_ghost_plr_submit:${draftShortId}:${position}`)
            .setTitle(`Añadir Fantasma (${position})`);

        const gameIdInput = new TextInputBuilder()
            .setCustomId('ghost_game_id')
            .setLabel("ID de Juego (PSN/EA ID)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const whatsappInput = new TextInputBuilder()
            .setCustomId('ghost_whatsapp')
            .setLabel("WhatsApp (con prefijo, ej: +34)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gameIdInput),
            new ActionRowBuilder().addComponents(whatsappInput)
        );

        await interaction.showModal(modal);
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
        } catch (e) { console.warn('No se pudo notificar al usuario de la baja de draft rechazada'); }

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
            .setTitle('Añadir Jugadores y Capitanes de Prueba');

        // <-- El nuevo campo para el objetivo de capitanes
        const targetCaptainsInput = new TextInputBuilder()
            .setCustomId('target_captains_input')
            .setLabel("Objetivo de Capitanes Totales")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("Ej: 8 o 16");

        // <-- El campo de siempre, pero con una etiqueta más clara
        const amountInput = new TextInputBuilder()
            .setCustomId('amount_input')
            .setLabel("¿Cuántos jugadores de prueba añadir en total?")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("Ej: 20");

        modal.addComponents(
            new ActionRowBuilder().addComponents(targetCaptainsInput),
            new ActionRowBuilder().addComponents(amountInput)
        );
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

    if (action === 'draft_force_tournament_classic') {
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
    if (action === 'draft_force_tournament_roulette') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        try {
            await prepareRouletteDraw(client, draftShortId);
            await interaction.editReply({ content: '✅ ¡Todo listo para el sorteo con ruleta! Se ha enviado un enlace privado al canal de los casters.' });
        } catch (error) {
            console.error('Error al preparar el sorteo con ruleta:', error);
            await interaction.editReply({ content: `❌ Hubo un error al preparar el sorteo: ${error.message}` });
        }
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
            } catch (e) { console.warn("No se pudo notificar al usuario del rechazo del pago."); }
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

        if (interaction.user.id !== captainId && !isAdmin) {
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
        // --- INICIO DE LA SOLUCIÓN: Capturar el channelId y pasarlo correctamente ---
        const [currentStepStr, originalBaseAction, channelId, entityId] = params;
        const originalAction = `${originalBaseAction}:${channelId}`;
        const currentStep = parseInt(currentStepStr);

        const isCaptainFlow = originalAction.includes('captain');
        const isTournamentFlow = !originalAction.startsWith('register_draft');
        const totalSteps = isCaptainFlow || isTournamentFlow ? 3 : 1;

        if (currentStep >= totalSteps) {
            if (originalAction.startsWith('register_draft_captain')) {
                const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({ label: value, value: key }));
                const posMenu = new StringSelectMenuBuilder()
                    .setCustomId(`draft_register_captain_pos_select:${entityId}:${channelId}`)
                    .setPlaceholder('Selecciona tu posición PRIMARIA como Capitán')
                    .addOptions(positionOptions);
                await interaction.update({ content: 'Has aceptado las normas. Ahora, selecciona tu posición.', components: [new ActionRowBuilder().addComponents(posMenu)], embeds: [] });

            } else if (isTournamentFlow) {
                // Lógica de torneo normal (no cambia)
            } else {
                const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({ label: value, value: key }));
                const primaryPosMenu = new StringSelectMenuBuilder()
                    .setCustomId(`draft_register_player_pos_select_primary:${entityId}:${channelId}`)
                    .setPlaceholder('Paso 1: Selecciona tu posición PRIMARIA')
                    .addOptions(positionOptions);
                await interaction.update({ content: 'Has aceptado las normas. Ahora, tu posición primaria.', components: [new ActionRowBuilder().addComponents(primaryPosMenu)], embeds: [] });
            }
        } else {
            const nextStepContent = createRuleAcceptanceEmbed(currentStep + 1, totalSteps, originalAction, entityId);
            await interaction.update(nextStepContent);
        }
        return;
        // --- FIN DE LA SOLUCIÓN ---
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



    if (action === 'admin_update_channel_status') {
        const channelSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_select_channel_to_update_icon')
            .setPlaceholder('Paso 1: Selecciona el canal a modificar')
            .addOptions([
                {
                    label: 'Canal de Torneos',
                    description: 'Modifica el icono del canal de anuncios de torneos.',
                    value: CHANNELS.TOURNAMENTS_STATUS,
                    emoji: '🏆'
                },
                {
                    label: 'Canal de Drafts',
                    description: 'Modifica el icono del canal de anuncios de drafts.',
                    value: CHANNELS.DRAFTS_STATUS,
                    emoji: '📝'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(channelSelectMenu);

        await interaction.reply({
            content: 'Por favor, elige qué canal de anuncios quieres actualizar.',
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

    if (action === 'create_flexible_league_mode') {
        const [mode, pendingId] = params;

        if (mode === 'swiss') {
            const modal = new ModalBuilder()
                .setCustomId(`create_flexible_league_swiss_rounds:${pendingId}`)
                .setTitle('Configurar Sistema Suizo');

            const roundsInput = new TextInputBuilder()
                .setCustomId('swiss_rounds_input')
                .setLabel('Número de Rondas')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: 3, 4, 5...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(roundsInput));
            await interaction.showModal(modal);
        } else if (mode === 'round_robin_custom') {
            const modal = new ModalBuilder()
                .setCustomId(`create_flexible_league_rr_custom:${pendingId}`)
                .setTitle('Configurar Liguilla Custom');

            const roundsInput = new TextInputBuilder()
                .setCustomId('rr_rounds_input')
                .setLabel('Número de Rondas')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: 5 (Generará 5 jornadas)')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(roundsInput));
            await interaction.showModal(modal);
        } else {
            // Round Robin Completo (All vs All)
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const pendingData = await db.collection('pending_tournaments').findOne({ pendingId });
            if (!pendingData) {
                return interaction.editReply('❌ Error: Datos no encontrados.');
            }

            const { nombre, shortId, config } = pendingData;
            config.leagueMode = 'round_robin';

            try {
                const result = await createNewTournament(client, guild, nombre, shortId, config);
                if (result.success) {
                    await interaction.editReply(`✅ ¡Éxito! El torneo **"${nombre}"** (Liguilla Completa) ha sido creado.`);
                } else {
                    await interaction.editReply(`❌ Error: ${result.message}`);
                }
                await db.collection('pending_tournaments').deleteOne({ pendingId });
            } catch (error) {
                console.error(error);
                await interaction.editReply('❌ Error crítico.');
            }
        }
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

            if (approvedTeams.length > 0) {
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
        await thread.setName(`⚠️${thread.name.replace(/^[⚔️✅]-/g, '')}`.slice(0, 100));
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
        const typeMenu = new StringSelectMenuBuilder().setCustomId(`admin_change_type_select:${tournamentShortId}`).setPlaceholder('Selecciona el nuevo tipo de pago').addOptions([{ label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' }]);
        await interaction.editReply({ content: `**Editando:** ${tournament.nombre}\nSelecciona el nuevo formato o tipo.`, components: [new ActionRowBuilder().addComponents(formatMenu), new ActionRowBuilder().addComponents(typeMenu)], });
        return;
    }

    if (action === 'admin_create_tournament_start') {
        // --- INICIO DE LA LÓGICA CORREGIDA ---
        // Filtramos la lista para mostrar solo los formatos de grupos (con tamaño fijo > 0)
        const groupFormats = Object.entries(TOURNAMENT_FORMATS)
            .filter(([, format]) => format.size > 0)
            .map(([key, format]) => ({
                label: format.label,
                value: key
            }));

        // Comprobación de seguridad: si no hay formatos, no continuamos.
        if (groupFormats.length === 0) {
            return interaction.reply({ content: '❌ No hay formatos de torneo de grupos configurados.', flags: [MessageFlags.Ephemeral] });
        }

        const formatMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_create_format')
            .setPlaceholder('Paso 1: Selecciona el formato del torneo')
            .addOptions(groupFormats); // Usamos la lista ya filtrada

        await interaction.reply({ content: 'Iniciando creación de torneo de grupos...', components: [new ActionRowBuilder().addComponents(formatMenu)], flags: [MessageFlags.Ephemeral] });
        // --- FIN DE LA LÓGICA CORREGIDA ---
        return;
    }

    if (action === 'admin_undo_draw') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        await interaction.editReply({ content: '⏳ **Recibido.** Iniciando el proceso para revertir el sorteo. Esto puede tardar unos segundos...' });
        try {
            await undoGroupStageDraw(client, tournamentShortId);
            await interaction.followUp({ content: '✅ **Sorteo revertido con éxito!** El torneo está de nuevo en fase de inscripción.', flags: [MessageFlags.Ephemeral] });
        } catch (error) {
            console.error(`Error al revertir el sorteo para ${tournamentShortId}:`, error);
            await interaction.followUp({ content: `❌ Hubo un error al revertir el sorteo: ${error.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    if (action === 'admin_approve') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        let teamData = null;
        let sourceCollection = null;

        if (tournament.teams.pendientes && tournament.teams.pendientes[captainId]) {
            teamData = tournament.teams.pendientes[captainId];
            sourceCollection = 'pendientes';
        } else if (tournament.teams.reserva && tournament.teams.reserva[captainId]) {
            teamData = tournament.teams.reserva[captainId];
            sourceCollection = 'reserva';
        } else if (tournament.teams.pendingPayments && tournament.teams.pendingPayments[captainId]) {
            // --- NEW FLOW SUPPORT ---
            const ppData = tournament.teams.pendingPayments[captainId];
            teamData = {
                id: ppData.userId,
                nombre: ppData.teamName,
                eafcTeamName: ppData.eafcTeamName,
                capitanId: ppData.userId,
                capitanTag: ppData.userTag,
                coCaptainId: null,
                coCaptainTag: null,
                bandera: '🏳️',
                paypal: ppData.paypal || null,
                streamChannel: ppData.streamChannel,
                twitter: ppData.twitter || '',
                inscritoEn: ppData.registeredAt
            };
            sourceCollection = 'pendingPayments';
        }

        if (!tournament || !teamData) {
            return interaction.editReply({ content: 'Error: Solicitud no encontrada o ya procesada.' });
        }

        await approveTeam(client, tournament, teamData);

        // Clean up from source
        if (sourceCollection === 'pendingPayments') {
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { [`teams.pendingPayments.${captainId}`]: "" } });

            // --- FALLBACK NOTIFICATION ---
            try {
                const user = await client.users.fetch(captainId);
                const fallbackEmbed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle(`✅ Pago Aprobado / Payment Approved`)
                    .setDescription(`🇪🇸 Tu pago ha sido verificado y tu equipo **${teamData.nombre}** ha sido aceptado en el torneo.\n\n🇬🇧 Your payment has been verified and your team **${teamData.nombre}** has been accepted into the tournament.`);
                await user.send({ embeds: [fallbackEmbed] });
            } catch (e) {
                console.warn(`[FALLBACK] No se pudo enviar MD de respaldo al usuario ${captainId}`);
            }
        }

        const kickButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_kick:${captainId}:${tournamentShortId}`).setLabel("Expulsar del Torneo / Kick from Tournament").setStyle(ButtonStyle.Danger));
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Aprobado por ${interaction.user.tag}` }).setColor('#2ecc71');

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

        let teamData = null;
        let sourceCollection = null;

        if (tournament.teams.pendientes && tournament.teams.pendientes[captainId]) {
            teamData = tournament.teams.pendientes[captainId];
            sourceCollection = 'pendientes';
        } else if (tournament.teams.reserva && tournament.teams.reserva[captainId]) {
            teamData = tournament.teams.reserva[captainId];
            sourceCollection = 'reserva';
        } else if (tournament.teams.pendingApproval && tournament.teams.pendingApproval[captainId]) {
            // NUEVO: Soporte para pendingApproval (primera aprobación de torneos de pago)
            const paData = tournament.teams.pendingApproval[captainId];
            teamData = { nombre: paData.teamName };
            sourceCollection = 'pendingApproval';
        } else if (tournament.teams.pendingPayments && tournament.teams.pendingPayments[captainId]) {
            const ppData = tournament.teams.pendingPayments[captainId];
            teamData = { nombre: ppData.teamName };
            sourceCollection = 'pendingPayments';
        }

        if (!tournament || !teamData) return interaction.editReply({ content: 'Error: Solicitud no encontrada o ya procesada.' });

        if (sourceCollection === 'pendientes') {
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { [`teams.pendientes.${captainId}`]: "" } });
        } else if (sourceCollection === 'reserva') {
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { [`teams.reserva.${captainId}`]: "" } });
        } else if (sourceCollection === 'pendingApproval') {
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { [`teams.pendingApproval.${captainId}`]: "" } });
        } else if (sourceCollection === 'pendingPayments') {
            await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { [`teams.pendingPayments.${captainId}`]: "" } });
        }

        try {
            const user = await client.users.fetch(captainId);
            await user.send(`❌ 🇪🇸 Tu inscripción para el equipo **${teamData.nombre}** en el torneo **${tournament.nombre}** ha sido **rechazada**.\n🇬🇧 Your registration for the team **${teamData.nombre}** in the **${tournament.nombre}** tournament has been **rejected**.`);
        } catch (e) { console.warn(`No se pudo enviar MD de rechazo al usuario ${captainId}`); }

        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Rechazado por ${interaction.user.tag}` }).setColor('#e74c3c');

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
        originalEmbed.setFooter({ text: `Expulsado por ${interaction.user.tag}` }).setColor('#95a5a6');
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
        // Respondemos inmediatamente para evitar el timeout
        await interaction.reply({
            content: '⏳ Orden recibida. La simulación de todos los partidos pendientes ha comenzado en segundo plano. Esto puede tardar un momento.',
            flags: [MessageFlags.Ephemeral]
        });

        const [tournamentShortId] = params;

        // Ejecutamos la simulación y NO esperamos a que termine (trabajo en segundo plano)
        simulateAllPendingMatches(client, tournamentShortId)
            .then(result => {
                // Cuando termina, intentamos editar la respuesta inicial
                interaction.editReply(`✅ Simulación completada. ${result.message}`).catch(() => {
                    // Si falla (porque ha pasado mucho tiempo), enviamos un nuevo mensaje al canal
                    interaction.channel.send(`✅ La simulación para el torneo \`${tournamentShortId}\` ha finalizado. ${result.message}`);
                });
            })
            .catch(error => {
                console.error("Error crítico durante la simulación de partidos:", error);
                interaction.editReply(`❌ Ocurrió un error crítico durante la simulación: ${error.message}`).catch(() => {
                    interaction.channel.send(`❌ Ocurrió un error crítico durante la simulación para el torneo \`${tournamentShortId}\`.`);
                });
            });

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
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) {
            return interaction.reply({ content: "Error: Draft no encontrado.", flags: [MessageFlags.Ephemeral] });
        }

        const isCaptain = draft.captains.some(c => c.userId === interaction.user.id);
        if (isCaptain) {
            return interaction.reply({
                content: "❌ Los capitanes no pueden usar esta opción. La baja debe ser gestionada por un administrador.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        const playerEntry = draft.players.find(p => p.userId === interaction.user.id);
        if (!playerEntry) {
            return interaction.reply({ content: "No estás inscrito en este draft como jugador.", flags: [MessageFlags.Ephemeral] });
        }

        if (draft.status === 'seleccion') {
            return interaction.reply({ content: "No puedes solicitar la baja mientras la fase de selección está en curso.", flags: [MessageFlags.Ephemeral] });
        }

        if (playerEntry.captainId) {
            const modal = new ModalBuilder()
                .setCustomId(`unregister_draft_reason_modal:${draftShortId}`)
                .setTitle('Solicitar Baja de Equipo');
            const reasonInput = new TextInputBuilder()
                .setCustomId('reason_input').setLabel("Motivo de tu solicitud de baja")
                .setPlaceholder("Explica brevemente por qué deseas dejar el equipo.").setStyle(TextInputStyle.Paragraph)
                .setRequired(true).setMaxLength(500);
            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

            await interaction.showModal(modal);

        } else {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const result = await requestUnregisterFromDraft(client, draft, interaction.user.id, "Agente Libre (no fichado)");
            await interaction.editReply({ content: result.message });
        }
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
        } catch (e) { console.warn('No se pudo notificar al usuario de la baja rechazada'); }

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
        originalEmbed.setTitle(`✅ PAGO REALIZADO: ${prizeType.toUpperCase()}`).setColor('#2ecc71').setFooter({ text: `Marcado como pagado por ${interaction.user.tag}` });

        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
        await interaction.editReply(`✅ Pago marcado como realizado. Se ha notificado a <@${userId}>.`);
        return;
    }

    if (action === 'admin_manage_waitlist') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const waitlist = tournament.teams.reserva ? Object.values(tournament.teams.reserva) : [];
        if (waitlist.length === 0) {
            return interaction.editReply({ content: 'La lista de reserva está vacía.' });
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

        await interaction.editReply({ content: 'Selecciona un equipo de la lista de reserva para aprobarlo y añadirlo al torneo:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
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
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ No tienes permisos para reclamar tickets.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferUpdate();
        const [channelId] = params;
        const db = getDb();
        const ticket = await db.collection('verificationtickets').findOne({ channelId });

        if (!ticket || ticket.status === 'closed') {
            return interaction.followUp({ content: '❌ Este ticket ya ha sido cerrado.', flags: [MessageFlags.Ephemeral] });
        }
        if (ticket.status === 'claimed') {
            return interaction.followUp({ content: `🟡 Este ticket ya está siendo atendido por <@${ticket.claimedBy}>.`, flags: [MessageFlags.Ephemeral] });
        }

        await db.collection('verificationtickets').updateOne({ _id: ticket._id }, {
            $set: {
                status: 'claimed',
                claimedBy: interaction.user.id
            }
        });

        const embedInTicket = EmbedBuilder.from(interaction.message.embeds[0]);
        embedInTicket.addFields({ name: 'Estado', value: `🟡 **Atendido por:** <@${interaction.user.id}>` });

        // --- LÓGICA DE BOTONES MEJORADA ---
        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve_verification:${channelId}`).setLabel('Aprobar Verificación').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_verification_start:${channelId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger),
            // --- INICIO DE LA MODIFICACIÓN ---
            new ButtonBuilder().setCustomId(`admin_close_ticket:${channelId}`).setLabel('Cerrar Ticket').setStyle(ButtonStyle.Secondary) // <-- BOTÓN AÑADIDO
            // --- FIN DE LA MODIFICACIÓN ---
        );

        await interaction.message.edit({ embeds: [embedInTicket], components: [actionButtons] });

        if (ticket.adminNotificationMessageId) {
            try {
                const adminApprovalChannel = await client.channels.fetch(ADMIN_APPROVAL_CHANNEL_ID);
                const notificationMessage = await adminApprovalChannel.messages.fetch(ticket.adminNotificationMessageId);
                const originalAdminEmbed = notificationMessage.embeds[0];
                const updatedAdminEmbed = EmbedBuilder.from(originalAdminEmbed)
                    .setTitle(`🟡 Ticket Atendido por ${interaction.user.tag}`)
                    .setColor('#f1c40f');
                await notificationMessage.edit({ embeds: [updatedAdminEmbed] });
            } catch (error) {
                console.warn(`[CLAIM UPDATE] No se pudo actualizar el mensaje de notificación del ticket ${ticket._id}.`, error.message);
            }
        }
    }

    if (action === 'approve_verification') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ No tienes permisos para esta acción.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferUpdate();
        const [channelId] = params;
        const db = getDb();
        const ticket = await db.collection('verificationtickets').findOne({ channelId });

        if (!ticket || ticket.status === 'closed') return;

        if (ticket.status === 'claimed' && ticket.claimedBy !== interaction.user.id) {
            return interaction.followUp({ content: `❌ Este ticket está siendo atendido por <@${ticket.claimedBy}>.`, flags: [MessageFlags.Ephemeral] });
        }

        if (ticket.adminNotificationMessageId) {
            try {
                const adminApprovalChannel = await client.channels.fetch(ADMIN_APPROVAL_CHANNEL_ID);
                await adminApprovalChannel.messages.delete(ticket.adminNotificationMessageId).catch(() => { });
            } catch (error) { console.warn(`[CLEANUP] No se pudo borrar el mensaje de notificación del ticket ${ticket._id}.`); }
        }

        await db.collection('verified_users').updateOne(
            { discordId: ticket.userId },
            {
                $set: {
                    discordTag: (await client.users.fetch(ticket.userId)).tag,
                    gameId: ticket.gameId, platform: ticket.platform,
                    twitter: ticket.twitter, whatsapp: ticket.whatsapp,
                    verifiedAt: new Date(),
                }
            },
            { upsert: true }
        );

        const guild = await client.guilds.fetch(ticket.guildId);
        const member = await guild.members.fetch(ticket.userId);
        const verifiedRole = await guild.roles.fetch(VERIFIED_ROLE_ID);
        if (member && verifiedRole) await member.roles.add(verifiedRole);

        try {
            await member.send('🎉 **¡Identidad Verificada con Éxito!** 🎉\nTu cuenta ha sido aprobada. Vuelve al canal del ticket para finalizar el proceso.');
        } catch (e) { console.warn(`No se pudo enviar MD de aprobación al usuario ${ticket.userId}`); }

        const channel = await client.channels.fetch(channelId);
        const userActionRow = new ActionRowBuilder();

        if (ticket.draftShortId && ticket.draftShortId !== 'undefined') {
            userActionRow.addComponents(
                new ButtonBuilder().setCustomId(`user_continue_to_register:${ticket.draftShortId}:${channelId}`).setLabel('Inscribirme al Draft').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`user_exit_without_registering:${channelId}`).setLabel('Salir sin Inscribirme').setStyle(ButtonStyle.Danger)
            );
        } else {
            userActionRow.addComponents(new ButtonBuilder().setCustomId(`user_exit_without_registering:${channelId}`).setLabel('Finalizar y Salir').setStyle(ButtonStyle.Success));
        }

        const approvalEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('✅ Verificación Aprobada')
            .setDescription('¡Enhorabuena! Tu cuenta ha sido verificada. ¿Qué deseas hacer ahora?');

        await channel.send({
            content: `<@${ticket.userId}>`,
            embeds: [approvalEmbed],
            components: [userActionRow]
        });

        const originalMessage = interaction.message;
        const disabledAdminRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledAdminRow.components.forEach(c => c.setDisabled(true));
        const finalEmbedInTicket = EmbedBuilder.from(originalMessage.embeds[0]);
        finalEmbedInTicket.data.fields.find(f => f.name === 'Estado').value = `✅ **Aprobado por:** <@${interaction.user.id}>`;
        await originalMessage.edit({ embeds: [finalEmbedInTicket], components: [disabledAdminRow] });

        await db.collection('verificationtickets').updateOne({ _id: ticket._id }, { $set: { status: 'closed' } });
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

    if (action === 'admin_assign_cocaptain_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        const approvedTeams = Object.values(tournament.teams.aprobados);
        if (approvedTeams.length === 0) {
            return interaction.editReply({ content: 'No hay equipos aprobados en este torneo.' });
        }

        const teamOptions = approvedTeams.map(team => ({
            label: team.nombre,
            description: `Capitán: ${team.capitanTag}`,
            value: team.capitanId
        })).slice(0, 25);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_assign_cocaptain_team_select:${tournamentShortId}`)
            .setPlaceholder('Selecciona el equipo')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: 'Selecciona el equipo al que quieres asignar un co-capitán:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    // --- EXPULSAR EQUIPO (Admin) ---
    if (action === 'admin_kick_team_start') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        const approvedTeams = Object.values(tournament.teams.aprobados || {});
        if (approvedTeams.length === 0) {
            return interaction.reply({ content: '❌ No hay equipos aprobados para expulsar.', flags: [MessageFlags.Ephemeral] });
        }

        const teamOptions = approvedTeams.map(team => ({
            label: team.nombre,
            description: `Capitán: ${team.capitanTag}`,
            value: team.capitanId
        })).slice(0, 25);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_kick_team_select:${tournamentShortId}`)
            .setPlaceholder('Selecciona el equipo a expulsar')
            .addOptions(teamOptions);

        return interaction.reply({
            content: '⚠️ **ZONA DE PELIGRO** ⚠️\nSelecciona el equipo que deseas **EXPULSAR** del torneo:',
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (action === 'admin_kick_team_select') {
        const [tournamentShortId] = params;
        const captainId = interaction.values[0]; // El value del select es el ID del capitán

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_kick_team_confirm:${captainId}:${tournamentShortId}`)
                .setLabel('SÍ, EXPULSAR EQUIPO')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('delete_message_action') // Usamos un customId genérico o simplemente dejamos que el usuario descarte
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
            content: `🛑 **¿Estás seguro de que quieres expulsar a este equipo?**\nEsta acción eliminará su inscripción aprobada inmediatamente.`,
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (action === 'admin_kick_team_confirm') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament.teams.aprobados?.[captainId]) {
            return interaction.editReply('❌ El equipo ya no está en la lista de aprobados.');
        }

        const teamName = tournament.teams.aprobados[captainId].nombre;

        // EJECUTAR EXPULSIÓN
        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            { $unset: { [`teams.aprobados.${captainId}`]: "" } }
        );

        // Actualizar paneles
        // Pasamos el torneo viejo, las funciones harán refetch si es necesario
        // updateTournamentManagementThread hace refetch.
        // updatePublicMessages necesita import dinámico o estático. Ya tenemos estático arriba.
        const { updatePublicMessages } = await import('../logic/tournamentLogic.js');

        await updateTournamentManagementThread(client, tournament);
        await updatePublicMessages(client, tournament);

        return interaction.editReply(`✅ El equipo **${teamName}** ha sido expulsado correctamente.`);
    }

    // Handler para borrar mensaje (cancelar)
    if (action === 'delete_message_action') {
        if (interaction.message.deletable) await interaction.message.delete();
        else await interaction.deferUpdate(); // Simplemente quitamos el loading state
        return;
    }

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
    // --- REEMPLAZA TU BLOQUE 'admin_strike_approve / reject' CON ESTE ---

    if (action === 'admin_manual_register_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;

        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`admin_manual_register_user_select:${tournamentShortId}`)
            .setPlaceholder('Selecciona al usuario a inscribir')
            .setMaxValues(1);

        await interaction.editReply({
            content: 'Selecciona al usuario que deseas inscribir manualmente en este torneo de pago:',
            components: [new ActionRowBuilder().addComponents(userSelect)]
        });
        return;
    }

    if (action === 'admin_strike_approve' || action === 'admin_strike_reject') {
        // --- INICIO DE LA NUEVA LÓGICA DE PERMISOS ---
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isReferee = interaction.member.roles.cache.has(ARBITRO_ROLE_ID);

        if (!isAdmin && !isReferee) {
            return interaction.reply({
                content: '❌ Solo los administradores o árbitros pueden tomar una decisión sobre este reporte.',
                flags: [MessageFlags.Ephemeral]
            });
        }
        // --- FIN DE LA NUEVA LÓGICA DE PERMISOS ---

        await interaction.deferUpdate();
        const wasApproved = action === 'admin_strike_approve';

        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        if (wasApproved) {
            // 1. La razón ya no está en los params, así que la quitamos de aquí
            const [draftShortId, reportedId, reporterId, disputeChannelId] = params;
            const db = getDb();
            const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
            if (!draft) { /* ... manejo de error ... */ return; }
            const reporter = draft.captains.find(c => c.userId === reporterId);
            if (!reporter) { /* ... manejo de error ... */ return; }

            // 2. Leemos la razón directamente del embed del mensaje que contiene el botón
            const reason = interaction.message.embeds[0].fields.find(f => f.name === 'Motivo del Capitán').value;

            const reportedUser = await client.users.fetch(reportedId).catch(() => null);

            await db.collection('player_records').findOneAndUpdate(
                { userId: reportedId },
                { $inc: { strikes: 1 } },
                { upsert: true }
            );

            if (reportedUser) {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('⚖️ Decisión de Reporte: Strike Aplicado')
                    // 3. Usamos la variable 'reason' que acabamos de obtener
                    .setDescription(`Tras la revisión, un administrador ha **aprobado** el strike solicitado por tu capitán **${reporter.psnId}** en el draft **${draft.name}**.`)
                    .addFields({ name: 'Motivo del Strike', value: reason });
                await reportedUser.send({ embeds: [dmEmbed] }).catch(e => console.warn(`No se pudo notificar al jugador ${reportedId} del strike.`));
            }

            originalEmbed.setColor('#2ecc71').setFooter({ text: `Strike aprobado por ${interaction.user.tag}` });
            await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
            await interaction.followUp({ content: '✅ Strike aprobado y jugador notificado.', flags: [MessageFlags.Ephemeral] });

            if (disputeChannelId) {
                const channel = await client.channels.fetch(disputeChannelId).catch(() => null);
                if (channel) {
                    await channel.send('**Disputa finalizada. Strike APROBADO.** Este canal se eliminará en 10 segundos.');
                    setTimeout(() => {
                        channel.delete('Disputa resuelta.').catch(console.error);
                    }, 10000);
                }
            }
        } else { // Rechazado
            const [draftShortId, reportedId, reporterId, disputeChannelId] = params;
            const reporter = await client.users.fetch(reporterId).catch(() => null);
            if (reporter) await reporter.send('❌ Un administrador ha **rechazado** tu solicitud de strike tras revisar el caso.');

            originalEmbed.setColor('#e74c3c').setFooter({ text: `Solicitud rechazada por ${interaction.user.tag}` });
            await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
            await interaction.followUp({ content: '❌ Solicitud de strike rechazada.', flags: [MessageFlags.Ephemeral] });

            if (disputeChannelId) {
                const channel = await client.channels.fetch(disputeChannelId).catch(() => null);
                if (channel) {
                    await channel.send('**Disputa finalizada. Strike RECHAZADO.** Este canal se eliminará en 10 segundos.');
                    setTimeout(() => {
                        channel.delete('Disputa resuelta.').catch(console.error);
                    }, 10000);
                }
            }
        }
        return;
    }
    if (action === 'consult_player_data_start') {
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const member = interaction.member;

        const isCaptain = draft.captains.some(c => c.userId === member.id);
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isReferee = member.roles.cache.has(ARBITRO_ROLE_ID);

        if (!isCaptain && !isAdmin && !isReferee) {
            return interaction.reply({ content: '❌ No tienes permiso para usar esta función.', flags: [MessageFlags.Ephemeral] });
        }

        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId(`consult_player_data_select:${draftShortId}`)
            .setPlaceholder('Busca y selecciona a un jugador del servidor...');

        return interaction.reply({
            content: 'Por favor, selecciona al usuario cuyos datos de draft y verificación deseas consultar.',
            components: [new ActionRowBuilder().addComponents(userSelectMenu)],
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (action === 'user_continue_to_register') {
        const [draftShortId, channelId] = params;
        const ticket = await db.collection('verificationtickets').findOne({ channelId });

        if (interaction.user.id !== ticket.userId) {
            return interaction.reply({ content: '❌ Este botón no es para ti.', flags: [MessageFlags.Ephemeral] });
        }

        // --- MODIFICACIÓN CLAVE: Pasamos el channelId al siguiente paso ---
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`register_draft_player:${draftShortId}:${channelId}`).setLabel('👤 Inscribirme como Jugador').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`register_draft_captain:${draftShortId}:${channelId}`).setLabel('👑 Inscribirme como Capitán').setStyle(ButtonStyle.Secondary)
        );

        // ELIMINAMOS EL CIERRE AUTOMÁTICO
        await interaction.reply({
            content: `¡Perfecto! Selecciona cómo quieres inscribirte. Serás guiado por el proceso.\n\n*(Este canal de verificación permanecerá abierto hasta que finalices tu inscripción)*`,
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (action === 'user_exit_without_registering') {
        const [channelId] = params;
        const ticket = await db.collection('verificationtickets').findOne({ channelId });

        if (interaction.user.id !== ticket.userId) {
            return interaction.reply({ content: '❌ Este botón no es para ti.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            // Intenta responder. Si ya se respondió, el catch lo manejará.
            await interaction.reply({
                content: `De acuerdo, te sales sin inscribirte. Recuerda que siempre podrás hacerlo más tarde desde el canal <#${CHANNELS.DRAFTS_STATUS}>.`,
                flags: [MessageFlags.Ephemeral]
            });
        } catch (error) {
            if (error.code !== 'InteractionAlreadyReplied') {
                // Si es un error diferente, lo lanzamos para que se registre.
                throw error;
            }
            // Si es 'InteractionAlreadyReplied', lo ignoramos y continuamos.
            console.warn(`[WARN] Interacción 'user_exit_without_registering' ya respondida. Se procederá al cierre del canal de todas formas.`);
        }

        // Esta parte se ejecuta siempre, incluso si la interacción ya fue respondida.
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
            await channel.send('El usuario ha decidido salir. Este canal se cerrará en 10 segundos.');
            setTimeout(() => channel.delete('Usuario salió del proceso.').catch(console.error), 10000);
        }
    }

    if (action === 'user_exit_without_registering') {
        const [channelId] = params;
        const ticket = await db.collection('verificationtickets').findOne({ channelId });

        if (interaction.user.id !== ticket.userId) {
            return interaction.reply({ content: '❌ Este botón no es para ti.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            // Intenta responder. Si ya se respondió, el catch lo manejará.
            await interaction.reply({
                content: `De acuerdo, te sales sin inscribirte. Recuerda que siempre podrás hacerlo más tarde desde el canal <#${CHANNELS.DRAFTS_STATUS}>.`,
                flags: [MessageFlags.Ephemeral]
            });
        } catch (error) {
            if (error.code !== 'InteractionAlreadyReplied') {
                // Si es un error diferente, lo lanzamos para que se registre.
                throw error;
            }
            // Si es 'InteractionAlreadyReplied', lo ignoramos y continuamos.
            console.warn(`[WARN] Interacción 'user_exit_without_registering' ya respondida. Se procederá al cierre del canal de todas formas.`);
        }

        // Esta parte se ejecuta siempre, incluso si la interacción ya fue respondida.
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
            await channel.send('El usuario ha decidido salir. Este canal se cerrará en 10 segundos.');
            setTimeout(() => channel.delete('Usuario salió del proceso.').catch(console.error), 10000);
        }
    }

    if (action === 'admin_close_ticket') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Solo los administradores pueden usar este botón.', flags: [MessageFlags.Ephemeral] });
        }
        await interaction.deferUpdate();
        const [channelId] = params;

        // --- INICIO DE LA MODIFICACIÓN DE SEGURIDAD ---
        const db = getDb();
        // Marcamos el ticket como cerrado en la BBDD para evitar que se quede "atascado"
        await db.collection('verificationtickets').updateOne(
            { channelId: channelId },
            { $set: { status: 'closed' } }
        );
        // --- FIN DE LA MODIFICACIÓN DE SEGURIDAD ---

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
            await channel.send(`Ticket cerrado manualmente por <@${interaction.user.id}>. Este canal se cerrará en 10 segundos.`);
            setTimeout(() => channel.delete('Ticket cerrado manualmente por admin.').catch(console.error), 10000);
        }
    }

    if (action === 'captain_view_free_agents') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        const member = interaction.member;
        const isCaptain = draft.captains.some(c => c.userId === member.id);
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isReferee = member.roles.cache.has(ARBITRO_ROLE_ID);

        if (!isCaptain && !isAdmin && !isReferee) {
            return interaction.editReply({ content: '❌ No tienes permiso para usar esta función.' });
        }

        const searchTypeMenu = new StringSelectMenuBuilder()
            .setCustomId(`free_agent_search_type:${draftShortId}`)
            .setPlaceholder('Paso 1: Elige cómo buscar al jugador')
            .addOptions([
                { label: 'Por Posición Primaria', value: 'primary', emoji: '⭐' },
                { label: 'Por Posición Secundaria', value: 'secondary', emoji: '🔹' }
            ]);

        await interaction.editReply({
            content: '¿Cómo deseas buscar entre los agentes libres disponibles?',
            components: [new ActionRowBuilder().addComponents(searchTypeMenu)]
        });
        return;
    }
    if (action === 'admin_add_registered_team_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;

        const allTeams = await getDb('test').collection('teams').find({ guildId: interaction.guildId }).toArray();
        if (!allTeams || allTeams.length === 0) {
            return interaction.editReply({ content: 'No hay equipos registrados en la base de datos para añadir.' });
        }

        // Ordenamos los equipos alfabéticamente por nombre
        allTeams.sort((a, b) => a.name.localeCompare(b.name));

        const pageSize = 25;
        const pageCount = Math.ceil(allTeams.length / pageSize);
        const page = 0; // Empezamos en la primera página

        const startIndex = page * pageSize;
        const teamsOnPage = allTeams.slice(startIndex, startIndex + pageSize);

        const teamOptions = teamsOnPage.map(team => ({
            label: team.name,
            description: `Manager ID: ${team.managerId}`,
            value: team._id.toString()
        }));

        const teamSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_registered_team_to_add:${tournamentShortId}`)
            .setPlaceholder('Paso 1: Selecciona el equipo a inscribir')
            .addOptions(teamOptions);

        const components = [new ActionRowBuilder().addComponents(teamSelectMenu)];

        // Si hay más de una página, añadimos el selector de página
        if (pageCount > 1) {
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                const startNum = i * pageSize + 1;
                const endNum = Math.min((i + 1) * pageSize, allTeams.length);
                pageOptions.push({
                    label: `Página ${i + 1} (${startNum}-${endNum})`,
                    value: `page_${i}`
                });
            }
            const pageSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_select_team_page:${tournamentShortId}`)
                .setPlaceholder('Paso 2: Cambiar de página')
                .addOptions(pageOptions);

            // Lo añadimos como una nueva fila de componentes
            components.push(new ActionRowBuilder().addComponents(pageSelectMenu));
        }

        // --- BOTÓN DE BÚSQUEDA ---
        const searchButton = new ButtonBuilder()
            .setCustomId(`admin_search_team_start:${tournamentShortId}`)
            .setLabel('🔍 Buscar Equipo')
            .setStyle(ButtonStyle.Secondary);

        // Añadimos el botón de búsqueda SIEMPRE en una nueva fila para evitar conflictos con SelectMenus
        components.push(new ActionRowBuilder().addComponents(searchButton));
        // -------------------------

        await interaction.editReply({
            content: `Mostrando ${teamsOnPage.length} de ${allTeams.length} equipos registrados. Por favor, selecciona un equipo:`,
            components
        });
        return;
    }

    if (action === 'admin_search_team_start') {
        const [tournamentShortId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`admin_search_team_modal:${tournamentShortId}`)
            .setTitle('Buscar Equipo Registrado');

        const searchInput = new TextInputBuilder()
            .setCustomId('search_query')
            .setLabel("Nombre del equipo (o parte)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ej: Real, City, United...")
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
        await interaction.showModal(modal);
        return;
    }
    if (action === 'admin_kick_team_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const approvedTeams = Object.values(tournament.teams.aprobados);

        if (approvedTeams.length === 0) {
            return interaction.editReply({ content: 'No hay equipos aprobados en este torneo para expulsar.' });
        }

        const teamOptions = approvedTeams.map(team => ({
            label: team.nombre,
            description: `Capitán: ${team.capitanTag}`,
            value: team.capitanId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_kick_team_select:${tournamentShortId}`)
            .setPlaceholder('Selecciona el equipo a expulsar')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: 'Por favor, selecciona de la lista el equipo que deseas expulsar del torneo. Esta acción es irreversible.',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }
    if (action === 'create_flexible_league_start') {
        const modal = new ModalBuilder()
            .setCustomId('create_flexible_league_modal')
            .setTitle('Configuración de la Liguilla Flexible');

        const nameInput = new TextInputBuilder()
            .setCustomId('torneo_nombre')
            .setLabel("Nombre del Torneo")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const qualifiersInput = new TextInputBuilder()
            .setCustomId('torneo_qualifiers')
            .setLabel("Nº de Equipos que se Clasifican")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ej: 4 (para semis), 8 (para cuartos)...")
            .setRequired(true);

        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_create_type:flexible_league') // Usamos el ID del formato
            .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
            .addOptions([{ label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' }]);

        // NOTA: Por simplicidad, la liguilla será siempre a 'ida'.
        // El modal para los datos de pago se gestionará en el handler de menús.

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(qualifiersInput)
        );

        // La respuesta inicial ahora incluye un menú para elegir el tipo
        return interaction.reply({
            content: "Has elegido crear una Liguilla Flexible. Por favor, rellena los datos básicos y selecciona el tipo de inscripción.",
            components: [new ActionRowBuilder().addComponents(typeMenu)],
            flags: [MessageFlags.Ephemeral]
        });
    }
    // Muestra el submenú para gestionar resultados de partidos finalizados
    if (action === 'admin_manage_results_start') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        const embed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle(`Gestión de Resultados: ${tournament.nombre}`)
            .setDescription('Selecciona una acción para corregir un partido que ya ha finalizado.')
            .setFooter({ text: `ID del Torneo: ${tournament.shortId}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_reopen_match_start:${tournamentShortId}`)
                .setLabel('Reabrir Partido Cerrado')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏪'),
            new ButtonBuilder()
                .setCustomId(`admin_modify_final_result_start:${tournamentShortId}`)
                .setLabel('Modificar Resultado Final')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('✍️'),
            new ButtonBuilder()
                .setCustomId(`admin_return_to_main_panel:${tournamentShortId}`)
                .setLabel('<< Volver')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        return;
    }

    // Devuelve al usuario al panel de gestión principal del torneo
    if (action === 'admin_return_to_main_panel') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const panelContent = createTournamentManagementPanel(tournament);
        await interaction.editReply(panelContent);
        return;
    }
    // Muestra la lista de partidos para reabrir o modificar
    if (action === 'admin_reopen_match_start' || action === 'admin_modify_final_result_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        // --- MEJORA: Para "Reabrir", mostramos primero los equipos ---
        if (action === 'admin_reopen_match_start') {
            const approvedTeams = Object.values(tournament.teams.aprobados);

            if (approvedTeams.length === 0) {
                return interaction.editReply({ content: 'No hay equipos aprobados en este torneo.' });
            }

            const teamOptions = approvedTeams.map(team => ({
                label: team.nombre,
                description: `Capitán: ${team.capitanTag}`,
                value: team.id
            })).slice(0, 25);

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_reopen_select_team:${tournamentShortId}`)
                .setPlaceholder('Paso 1: Selecciona el equipo')
                .addOptions(teamOptions);

            await interaction.editReply({
                content: 'Selecciona el equipo cuyo partido quieres reabrir:',
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
            return;
        }

        // --- Para "Modificar Resultado", mantenemos el flujo antiguo (por ahora) ---
        const allMatches = [
            ...Object.values(tournament.structure.calendario || {}).flat(),
            ...Object.values(tournament.structure.eliminatorias || {}).flat()
        ];

        const completedMatches = allMatches.filter(match => match && match.status === 'finalizado' && match.id !== 'ghost');

        if (completedMatches.length === 0) {
            return interaction.editReply({ content: 'No hay partidos finalizados para gestionar en este torneo.' });
        }

        // Creamos las opciones para el menú desplegable
        const matchOptions = completedMatches.map(match => {
            const stage = match.nombreGrupo ? `${match.nombreGrupo} - J${match.jornada}` : match.jornada;
            return {
                label: `${stage}: ${match.equipoA.nombre} vs ${match.equipoB.nombre}`,
                description: `Resultado actual: ${match.resultado}`,
                value: match.matchId,
            };
        }).slice(0, 25); // Discord solo permite 25 opciones por menú

        const selectMenuId = `admin_modify_final_result_select:${tournamentShortId}`;

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(selectMenuId)
            .setPlaceholder('Selecciona el partido que quieres gestionar...')
            .addOptions(matchOptions);

        let content = 'Selecciona el partido cuyo resultado final deseas modificar directamente.';

        if (completedMatches.length > 25) {
            content += '\n\n⚠️ **Atención:** Solo se muestran los primeros 25 partidos finalizados.';
        }

        await interaction.editReply({
            content: content,
            components: [new ActionRowBuilder().addComponents(selectMenu)],
        });
        return;
    }

    // --- LÓGICA DE PAGO PARA TORNEOS ---
    if (action === 'payment_confirm_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('❌ Este torneo ya no existe.');

        const notificationsChannel = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (!notificationsChannel) return interaction.editReply('Error interno: No se pudo encontrar el canal de notificaciones.');

        const userId = interaction.user.id;
        const pendingData = tournament.teams.pendingPayments ? tournament.teams.pendingPayments[userId] : null;

        if (!pendingData) return interaction.editReply('❌ No se encontró tu inscripción pendiente. Por favor, inscríbete de nuevo.');

        // Pedimos el PayPal/Bizum al usuario para facilitar la comprobación
        const modal = new ModalBuilder()
            .setCustomId(`payment_confirm_submit:${tournamentShortId}`)
            .setTitle('Confirmar Pago');

        const refInput = new TextInputBuilder()
            .setCustomId('payment_ref_input')
            .setLabel("Tu PayPal/Bizum (para comprobar)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(refInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'payment_confirm_submit') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const ref = interaction.fields.getTextInputValue('payment_ref_input');
        const userId = interaction.user.id;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const pendingData = tournament.teams.pendingPayments[userId];
        const notificationsChannel = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId);

        const adminEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle(`💰 Notificación de Pago: ${tournament.nombre}`).addFields(
            { name: 'Usuario', value: `<@${userId}> (${pendingData.userTag})`, inline: true },
            { name: 'Equipo', value: pendingData.teamName, inline: true },
            { name: "Referencia de Pago", value: `\`${ref}\``, inline: false },
            { name: "Plataforma", value: pendingData.platform.toUpperCase(), inline: true }
        );
        const adminButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_approve_payment:${tournamentShortId}:${userId}`).setLabel('Aprobar Pago').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`admin_reject_payment:${tournamentShortId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

        await notificationsChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
        await interaction.editReply('✅ ¡Gracias! Tu pago ha sido notificado. Recibirás un aviso cuando sea aprobado.');
        return;
    }

    // NUEVO HANDLER: Primera aprobación (enviar info de pago)
    if (action === 'admin_approve_payment_info') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament) {
            return interaction.editReply('❌ Torneo no encontrado');
        }

        // CORRECCIÓN: Buscar en pendingPayments (donde guarda la web/modal) o pendingApproval (legacy)
        const pendingData = tournament.teams.pendingPayments?.[captainId] || tournament.teams.pendingApproval?.[captainId];

        if (!pendingData) {
            console.log(`[DEBUG] Solicitud no encontrada para ${captainId} en torneo ${tournamentShortId}`);
            return interaction.editReply('❌ Solicitud no encontrada o ya procesada');
        }

        // 1. Mover de pendingApproval → pendingPayments
        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            {
                $set: {
                    [`teams.pendingPayments.${captainId}`]: {
                        ...pendingData,
                        status: 'awaiting_payment',
                        paymentInfoSentAt: new Date(),
                        paypal: null
                    }
                },
                $unset: { [`teams.pendingApproval.${captainId}`]: "" }
            }
        );

        // 2. Construir info de pago
        let paymentInstructions = '';
        if (tournament.config.paypalEmail) {
            paymentInstructions += `\n- **PayPal:** \`${tournament.config.paypalEmail}\``;
        }
        if (tournament.config.bizumNumber) {
            paymentInstructions += `\n- **Bizum:** \`${tournament.config.bizumNumber}\``;
        }
        if (!paymentInstructions) {
            paymentInstructions = "\n*No hay métodos configurados. Contacta con un administrador.*";
        }

        // 3. Enviar DM al usuario con info de pago
        try {
            const user = await client.users.fetch(captainId);
            const paymentEmbed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle(`✅ Solicitud Aprobada - ${tournament.nombre}`)
                .setDescription(
                    `🇪🇸 ¡Tu solicitud ha sido aprobada! Para confirmar tu plaza, realiza el pago de **${tournament.config.entryFee}€**.\n\n` +
                    `🇬🇧 Your request has been approved! To confirm your spot, make the payment of **${tournament.config.entryFee}€**.`
                )
                .addFields(
                    { name: '💰 Métodos de Pago / Payment Methods', value: paymentInstructions },
                    {
                        name: '📋 Instrucciones / Instructions', value:
                            '1. Realiza el pago / Make the payment\n' +
                            '2. Pulsa el botón de abajo / Click the button below'
                    }
                );

            const confirmButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`payment_confirm_start:${tournamentShortId}`)
                    .setLabel('✅ Ya he realizado el Pago / Payment Done')
                    .setStyle(ButtonStyle.Success)
            );

            await user.send({ embeds: [paymentEmbed], components: [confirmButton] });

            // Deshabilitar botones del mensaje de admin
            const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
            disabledRow.components.forEach(c => c.setDisabled(true));
            await interaction.message.edit({ components: [disabledRow] });

            await interaction.editReply(`✅ Información de pago enviada a <@${captainId}>`);

        } catch (error) {
            console.error('Error enviando DM:', error);
            await interaction.editReply(`⚠️ Aprobado pero no se pudo enviar DM. Contacta con <@${captainId}> manualmente.`);
        }
        return;
    }

    if (action === 'admin_approve_payment') {
        await interaction.deferUpdate();
        const [tournamentShortId, userId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const pendingData = tournament.teams.pendingPayments[userId];

        if (!pendingData) {
            return interaction.followUp({ content: '❌ Error: No se encontraron los datos pendientes de este usuario.', flags: [MessageFlags.Ephemeral] });
        }

        // Construimos el objeto de equipo final
        const teamData = {
            id: userId, // En torneos de pago, el ID del equipo es el ID del usuario que paga
            nombre: pendingData.teamName,
            eafcTeamName: pendingData.eafcTeamName,
            capitanId: userId,
            capitanTag: pendingData.userTag,
            coCaptainId: null,
            coCaptainTag: null,
            logoUrl: pendingData.logoUrl,
            twitter: pendingData.twitter,
            streamChannel: pendingData.streamChannel,
            paypal: null, // Ya pagó
            inscritoEn: new Date(),
            isPaid: true
        };

        // Borramos de pendientes y aprobamos directamente
        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            {
                $unset: { [`teams.pendingPayments.${userId}`]: "" }
            }
        );

        // Usamos approveTeam para gestionar la entrada oficial
        await approveTeam(client, tournament, teamData);

        await interaction.editReply({ content: `✅ Pago aprobado para **${pendingData.teamName}**. El equipo ha sido inscrito.`, components: [] });
        return;
    }

    if (action === 'admin_reject_payment') {
        await interaction.deferUpdate();
        const [tournamentShortId, userId] = params;

        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $unset: { [`teams.pendingPayments.${userId}`]: "" } }
        );

        try {
            const user = await client.users.fetch(userId);
            await user.send(`❌ Tu pago para el torneo ha sido rechazado. Por favor, contacta con un administrador si crees que es un error.`);
        } catch (e) { }

        await interaction.editReply({ content: `❌ Pago rechazado. La prehizo-inscripción ha sido eliminada.`, components: [] });
        return;
    }

    // Handler para el botón de "Reparar Hilos Perdidos"
    if (action === 'admin_recover_threads') {
        const [tournamentShortId] = params;
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) {
                return interaction.editReply({ content: '❌ No se encontró el torneo.' });
            }

            const approvedTeams = Object.values(tournament.teams.aprobados);
            if (approvedTeams.length === 0) {
                return interaction.editReply({ content: '❌ No hay equipos aprobados en este torneo.' });
            }

            // Crear menú de selección de equipos
            const teamOptions = approvedTeams.map(team => ({
                label: team.nombre,
                description: `Capitán: ${team.capitanTag}`,
                value: team.id,
                emoji: '🛡️'
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_select_team_for_thread_repair:${tournamentShortId}`)
                .setPlaceholder('Selecciona el equipo para revisar sus hilos')
                .addOptions(teamOptions);

            await interaction.editReply({
                content: '🔧 **Reparación Selectiva de Hilos**\n\nSelecciona el equipo cuyos partidos quieres revisar:',
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
        } catch (error) {
            console.error('[RECOVER ERROR]', error);
            await interaction.editReply({ content: `❌ Error durante la recuperación: ${error.message}` });
        }
        return;
    }


    if (action === 'admin_prize_paid') {
        await interaction.deferUpdate();
        const [tournamentShortId, userId, prizeType] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        const result = await confirmPrizePayment(client, userId, prizeType === 'campeon' ? 'Campeón' : 'Finalista', tournament);

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        originalEmbed.setColor('#2ecc71').setFooter({ text: `Pago marcado como completado por ${interaction.user.tag}` });

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true).setLabel('✅ PAGADO'));

        await interaction.message.edit({ embeds: [originalEmbed], components: [disabledRow] });

        if (result.success) {
            await interaction.followUp({ content: `✅ El usuario ha sido notificado del pago del premio de **${prizeType}**.`, flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.followUp({ content: `⚠️ El pago se marcó como realizado, pero no se pudo enviar el MD al usuario (posiblemente tenga los MDs cerrados).`, flags: [MessageFlags.Ephemeral] });
        }
        return;
    }
}
