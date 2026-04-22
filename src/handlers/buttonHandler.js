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
    handleImportedPlayers, sendPaymentApprovalRequest, updateTournamentConfig, updateDraftMainInterface, startKnockoutOnlyDraw, applyManualLeagueCalendar
} from '../logic/tournamentLogic.js';
import {
    checkVerification, startVerificationWizard, showVerificationModal, startProfileUpdateWizard, approveProfileUpdate, rejectProfileUpdate, openProfileUpdateThread
} from '../logic/verificationLogic.js';
import { findMatch, simulateAllPendingMatches } from '../logic/matchLogic.js';
import { updateAdminPanel, updateTournamentManagementThread } from '../utils/panelManager.js';
import { createRuleAcceptanceEmbed, createDraftStatusEmbed, createTeamRosterManagementEmbed, createGlobalAdminPanel, createStreamerWarningEmbed, createTournamentManagementPanel, createPoolEmbed } from '../utils/embeds.js';
import { parseExternalDraftWhatsappList } from '../utils/textParser.js';
import { getLeagueByElo, LEAGUE_EMOJIS } from '../logic/eloLogic.js';
import { generateExcelImage } from '../utils/twitter.js';
import ExcelJS from 'exceljs';
import { setBotBusy } from '../../index.js';
import { updateMatchThreadName, inviteUserToMatchThread } from '../utils/tournamentUtils.js';
import { createRegistrationListChannel, deleteRegistrationListChannel, scheduleRegistrationListUpdate, forceRefreshRegistrationList } from '../utils/registrationListManager.js';

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

    // --- INSCRIPCIÓN EXCLUSIVA DE CAPITÁN (DRAFT EXTERNO) ---
    if (action === 'inscribir_capitan_start') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] });
        }
        
        if (tournament.config?.registrationClosed) {
            return interaction.reply({ content: '❌ Las inscripciones de capitanes están cerradas.', flags: [MessageFlags.Ephemeral] });
        }

        const managerId = interaction.user.id;
        const isAlreadyRegistered = tournament.teams.aprobados?.[managerId] || tournament.teams.pendientes?.[managerId] || tournament.teams.pendingPayments?.[managerId] || tournament.teams.pendingApproval?.[managerId] || tournament.teams.reserva?.[managerId];

        if (isAlreadyRegistered) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`invite_cocaptain_start:${tournamentShortId}`)
                    .setLabel(isAlreadyRegistered.coCaptainId ? 'Reemplazar Ayudante' : 'Elegir Ayudante (Co-Capitán)')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🤝')
            );
            
            if (isAlreadyRegistered.coCaptainId) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`remove_cocaptain:${tournamentShortId}`)
                        .setLabel('Expulsar Ayudante')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️')
                );
            }

            // If not approved yet, allow them to cancel their captain registration
            if (!tournament.teams.aprobados?.[managerId]) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`cancel_captain_registration:${tournamentShortId}`)
                        .setLabel('Cancelar Inscripción de Capitán')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🧨')
                );
            }

            return interaction.reply({ 
                content: `✅ **Ya estás inscrito como capitán** (Estado: ${tournament.teams.aprobados?.[managerId] ? 'Aprobado' : 'Pendiente'}).\n\n👇 Usa los botones abajo para gestionar a tu co-capitán (ayudante)${!tournament.teams.aprobados?.[managerId] ? ' o cancelar tu inscripción' : ''}:`, 
                components: [row],
                flags: [MessageFlags.Ephemeral] 
            });
        }

        // Validate player registration
        if (tournament.config && tournament.config.paidSubType === 'draft') {
            const playerReg = await db.collection('external_draft_registrations').findOne({
                tournamentId: tournamentShortId,
                $or: [{ userId: interaction.user.id }, { discordId: interaction.user.id }]
            });

            if (!playerReg) {
                return interaction.reply({ 
                    content: '❌ **Debes inscribirte primero como jugador** pulsando el botón verde de "Inscribirme" o desde la página web antes de presentarte como capitán.', 
                    flags: [MessageFlags.Ephemeral] 
                });
            }
        }

        if (tournament.teams.rechazados && tournament.teams.rechazados[managerId]) {
            return interaction.reply({
                content: '❌ Has sido rechazado de este torneo. Solo un administrador puede desbloquearte para volver a inscribirte.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Show the WhatsApp input modal, same as the regular paid tournament flow
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
        const modal = new ModalBuilder()
            .setCustomId(`register_paid_team_modal:${tournamentShortId}`)
            .setTitle('Inscripción Draft Externo (Capitán)');

        const whatsappInput = new TextInputBuilder()
            .setCustomId('whatsapp_input')
            .setLabel('Tu número de WhatsApp')
            .setPlaceholder('Ej: +34 600123456 (obligatorio)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(whatsappInput));
        return interaction.showModal(modal);
    }
    // --- FIN INSCRIPCIÓN EXCLUSIVA CAPITÁN ---

    if (action === 'inscribir_equipo_start' || action === 'inscribir_reserva_start') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] });
        }
        const managerId = interaction.user.id;

        const isAlreadyRegistered = tournament.teams.aprobados?.[managerId] || tournament.teams.pendientes?.[managerId] || tournament.teams.pendingPayments?.[managerId] || tournament.teams.pendingApproval?.[managerId] || tournament.teams.reserva?.[managerId];

        if (isAlreadyRegistered) {
            return interaction.reply({ content: '❌ Ya estás inscrito como capitán o mánager de un equipo en este torneo.', flags: [MessageFlags.Ephemeral] });
        }

        // --- NUEVO FORMATO DE DRAFTS EXTERNOS: JUGADORES DESDE DISCORD ---
        if (tournament.config.isPaid && tournament.config.paidSubType === 'draft') {
            // SOLO comprobar si es jugador si las inscripciones de jugadores están ABIERTAS
            if (tournament.registrationsClosed === false) {
                const playerReg = await db.collection('external_draft_registrations').findOne({
                    tournamentId: tournamentShortId,
                    userId: interaction.user.id
                });

                if (playerReg) {
                    // Ya inscrito como jugador
                    const btnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`ext_reg_edit_start:${tournamentShortId}`).setLabel('Modificar mis Datos').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
                        new ButtonBuilder().setCustomId(`ext_reg_cancel:${tournamentShortId}`).setLabel('Darme de Baja').setStyle(ButtonStyle.Danger).setEmoji('❌')
                    );
                    return interaction.reply({
                        content: `✅ **Ya estás inscrito en este draft como ${playerReg.position}**.\n\n¿Qué deseas hacer?`,
                        components: [btnRow],
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`ext_reg_player_pos:${tournamentShortId}`)
                    .setPlaceholder('Selecciona tu posición en el campo...')
                    .addOptions([
                        { label: 'Portero (POR)', value: 'GK', emoji: '🥅' },
                        { label: 'Defensa (DFC)', value: 'DFC', emoji: '🧱' },
                        { label: 'Carrilero (CARR)', value: 'CARR', emoji: '⚡' },
                        { label: 'Medio (MC)', value: 'MC', emoji: '🎩' },
                        { label: 'Delantero (DC)', value: 'DC', emoji: '🏟️' }
                    ]);

                const posRow = new ActionRowBuilder().addComponents(selectMenu);

                return interaction.reply({
                    content: `👤 **Inscripción de Jugadores Abierta**\n\nPor favor, selecciona la posición principal en la que deseas jugar:`,
                    components: [posRow],
                    flags: [MessageFlags.Ephemeral]
                });
            }
        }
        // --- FIN DEL FLUJO DE JUGADOR ---

        if (tournament.config?.registrationClosed) {
            return interaction.reply({ content: '❌ Las inscripciones de capitanes para este torneo están cerradas.', flags: [MessageFlags.Ephemeral] });
        }

        // --- MODIFICACIÓN: TORNEOS DE PAGO (Flujo simplificado sin modal) ---
        if (tournament.config.isPaid) {
            // Check si el usuario fue rechazado previamente
            if (tournament.teams.rechazados && tournament.teams.rechazados[managerId]) {
                return interaction.reply({
                    content: '❌ Has sido rechazado de este torneo. Solo un administrador puede desbloquearte para volver a inscribirte.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const isDraft = tournament.config.paidSubType === 'draft';
            const modalTitle = isDraft ? 'Inscripción Draft Externo' : 'Inscripción Torneo de Pago';

            // Para todos los torneos de pago mostramos el modal pidiendo WhatsApp
            const modal = new ModalBuilder()
                .setCustomId(`register_paid_team_modal:${tournamentShortId}`)
                .setTitle(modalTitle);

            const whatsappInput = new TextInputBuilder()
                .setCustomId('whatsapp_input')
                .setLabel('Tu número de WhatsApp')
                .setPlaceholder('Ej: +34 600123456 (obligatorio)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(whatsappInput));
            await interaction.showModal(modal);
            return;
        }
        // --- FIN MODIFICACIÓN ---

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

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

        const { getBotSettings } = await import('../../database.js');
        const settings = await getBotSettings();
        if (settings.eaScannerEnabled && !team.eaClubId) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('team_link_ea_button')
                    .setLabel('🎮 Vincular Club EA')
                    .setStyle(ButtonStyle.Success)
            );
            return interaction.editReply({ 
                content: '❌ **Inscripción bloqueada.**\n\nEl sistema de estadísticas de EA Sports está activado en este servidor. Debes vincular tu Club de EA y esperar a que sea aprobado por un administrador antes de poder inscribirte en torneos.',
                components: [row]
            });
        }

        // --- VALIDACIÓN DE LIGAS/ELO ---
        if (tournament.config.allowedLeagues && tournament.config.allowedLeagues.length > 0) {
            const { getLeagueByElo } = await import('../logic/eloLogic.js');
            const teamLeague = getLeagueByElo(team.elo || 1000);
            
            if (!tournament.config.allowedLeagues.includes(teamLeague) && tournament.config.requireElo !== false) {
                const embedError = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('❌ Inscripción Rechazada')
                    .setDescription(`Tu equipo (**${team.name}**) pertenece a la liga **${teamLeague}** (ELO: \`${team.elo || 1000}\`), que no está permitida en este torneo.`)
                    .addFields({ name: 'Ligas Permitidas', value: tournament.config.allowedLeagues.join(', ') });
                
                return interaction.editReply({ embeds: [embedError] });
            }
        }
        // --- FIN VALIDACIÓN ---

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
        await interaction.deferUpdate();

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const team = await getDb('test').collection('teams').findOne({ _id: new ObjectId(teamId) });

        if (!tournament || !team) {
            return interaction.followUp({ content: '❌ El torneo o el equipo ya no existen.', flags: [MessageFlags.Ephemeral] });
        }

        const teamData = {
            id: team.managerId,
            nombre: team.name,
            eafcTeamName: team.name,
            capitanId: team.managerId,
            capitanTag: interaction.user.tag,
            coCaptainId: team.captains && team.captains.length > 0 ? team.captains[0] : null,
            coCaptainTag: null,
            logoUrl: team.logoUrl,
            twitter: team.twitterHandle || '',
            streamChannel: 'No requerido',
            paypal: null,
            inscritoEn: new Date(),
            extraCaptains: (team.captains || []).filter(id => id !== team.managerId)
        };

        if (!tournament.teams) tournament.teams = { pendientes: {} };
        if (!tournament.teams.pendientes) tournament.teams.pendientes = {};

        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { [`teams.pendientes.${teamData.capitanId}`]: teamData } });

        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);

        if (notificationsThread) {
            const adminEmbed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`🔔 Nueva Inscripción`)
                .setThumbnail(teamData.logoUrl)
                .addFields(
                    { name: 'Equipo', value: teamData.nombre, inline: true },
                    { name: 'Mánager', value: interaction.user.tag, inline: true }
                );
            const adminButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_approve:${teamData.capitanId}:${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`admin_reject:${teamData.capitanId}:${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
            );
            await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });
        }

        await interaction.editReply({ 
            content: `✅ ¡Tu inscripción para **${team.name}** ha sido recibida!\n\nHemos notificado a los administradores. Recibirás un aviso cuando sea revisada.`, 
            embeds: [], 
            components: [] 
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
                const whatsappInput = new TextInputBuilder().setCustomId('whatsapp_input').setLabel("Tu WhatsApp (Ej: +34 123456789)").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(streamUsernameInput),
                    new ActionRowBuilder().addComponents(teamNameInput),
                    new ActionRowBuilder().addComponents(eafcNameInput),
                    new ActionRowBuilder().addComponents(psnIdInput),
                    new ActionRowBuilder().addComponents(whatsappInput)
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

    if (action === 'adm_edit_tm_dt') {
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const team = tournament.teams.aprobados[captainId];

        if (!team) {
            return interaction.reply({ content: 'Error: No se pudo encontrar el equipo seleccionado.', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId(`admin_edit_team_modal:${tournamentShortId}:${captainId}`)
            .setTitle(`Editando: ${team.nombre}`);

        const teamNameInput = new TextInputBuilder().setCustomId('team_name_input').setLabel("Nombre del Equipo").setStyle(TextInputStyle.Short).setValue(team.nombre).setRequired(true);
        const eafcNameInput = new TextInputBuilder().setCustomId('eafc_name_input').setLabel("Nombre en EAFC").setStyle(TextInputStyle.Short).setValue(team.eafcTeamName).setRequired(true);
        const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Twitter (sin @)").setStyle(TextInputStyle.Short).setValue(team.twitter || '').setRequired(false);
        const streamInput = new TextInputBuilder().setCustomId('stream_url_input').setLabel("URL Completa del Stream").setStyle(TextInputStyle.Short).setValue(team.streamChannel || '').setRequired(false).setPlaceholder('Ej: https://www.twitch.tv/nombre');
        const logoUrlInput = new TextInputBuilder().setCustomId('logo_url_input').setLabel("URL del Logo (completa)").setStyle(TextInputStyle.Short).setValue(team.logoUrl || '').setRequired(false).setPlaceholder('Ej: https://i.imgur.com/logo.png');

        modal.addComponents(
            new ActionRowBuilder().addComponents(teamNameInput),
            new ActionRowBuilder().addComponents(eafcNameInput),
            new ActionRowBuilder().addComponents(twitterInput),
            new ActionRowBuilder().addComponents(streamInput),
            new ActionRowBuilder().addComponents(logoUrlInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (action === 'adm_replace_mgr_start') {
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const team = tournament.teams.aprobados[captainId];

        if (!team) {
            return interaction.reply({ content: 'Error: Equipo no encontrado.', flags: [MessageFlags.Ephemeral] });
        }

        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId(`adm_replace_mgr_select:${tournamentShortId}:${captainId}`)
            .setPlaceholder('Busca y selecciona al Nuevo Mánager...')
            .setMinValues(1)
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(userSelectMenu);

        await interaction.update({
            content: `⚠️ **VAS A REEMPLAZAR AL MANAGER/CAPITÁN DE __${team.nombre}__**\nEl usuario actual <@${team.capitanId}> será expulsado del equipo y de todos los hilos activos del torneo.\n\nPor favor, **selecciona al nuevo usuario** de Discord:`,
            embeds: [],
            components: [row]
        });
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

        const PAGE_SIZE = 25;

        if (approvedTeams.length > PAGE_SIZE) {
            // Paginación: mostrar selector de página primero
            const pageCount = Math.ceil(approvedTeams.length / PAGE_SIZE);
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                const start = i * PAGE_SIZE + 1;
                const end = Math.min((i + 1) * PAGE_SIZE, approvedTeams.length);
                pageOptions.push({
                    label: `Página ${i + 1} (Equipos ${start}-${end})`,
                    value: `page_${i}`,
                });
            }

            const pageMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_edit_team_page_select:${tournamentShortId}`)
                .setPlaceholder('Selecciona una página de equipos')
                .addOptions(pageOptions);

            await interaction.editReply({
                content: `Hay **${approvedTeams.length}** equipos. Selecciona una página para ver los equipos:`,
                components: [new ActionRowBuilder().addComponents(pageMenu)]
            });
        } else {
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
        }
        return;
    }

    if (action === 'admin_manage_cocaptains_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        // Collect all teams (approved + all pending lists) without duplicates
        const allTeamsMap = new Map();
        const addTeams = (list, type) => {
            if (!list) return;
            Object.values(list).forEach(t => {
                if (t && t.id && t.capitanId && !allTeamsMap.has(t.capitanId)) {
                    allTeamsMap.set(t.capitanId, { ...t, listType: type });
                }
            });
        };
        addTeams(tournament.teams.aprobados, 'Aprobado');
        addTeams(tournament.teams.pendientes, 'Pendiente');
        addTeams(tournament.teams.pendingApproval, 'Pendiente Appr');
        addTeams(tournament.teams.pendingPayments, 'Pago Pend');

        const allTeams = Array.from(allTeamsMap.values());

        if (allTeams.length === 0) {
            return interaction.editReply({ content: '❌ No hay equipos registrados en el torneo todavía.' });
        }

        const teamsToShow = allTeams.slice(0, 25);
        const teamOptions = teamsToShow.map(team => ({
            label: team.nombre.substring(0, 100),
            description: `Capitán: ${team.capitanTag || 'N/A'} - ${team.listType}`,
            value: team.capitanId, // We use capitanId as the identifier since co-captains are tied to the captain
            emoji: team.coCaptainId ? '🤝' : '👤'
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_team_cocaptains:${tournamentShortId}`)
            .setPlaceholder('Selecciona un equipo...')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: '🤝 **Gestión de Co-Capitanes / Ayudantes**\n\nSelecciona el equipo del que quieres gestionar su ayudante (máximo 25 equipos mostrados):',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_replace_team_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const approvedTeams = Object.values(tournament.teams.aprobados).filter(t => t && t.id);

        if (approvedTeams.length === 0) {
            return interaction.editReply({ content: 'No hay equipos aprobados para sustituir.' });
        }

        const teamsToShow = approvedTeams.slice(0, 25);
        const teamOptions = teamsToShow.map(team => ({
            label: team.nombre.substring(0, 100),
            description: `Capitán: ${team.capitanTag || 'N/A'}`,
            value: team.capitanId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_replace_team_old_select:${tournamentShortId}`)
            .setPlaceholder('¿Qué equipo sale del torneo?')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: '**Paso 1/3:** Selecciona el equipo que **SALE** del torneo:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_replace_team_search') {
        const [tournamentShortId, oldCaptainId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`admin_replace_team_search_modal:${tournamentShortId}:${oldCaptainId}`)
            .setTitle('Buscar Equipo de Reemplazo');

        const searchInput = new TextInputBuilder()
            .setCustomId('replace_search_query')
            .setLabel("Nombre del equipo nuevo (o parte)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ej: Real, City, United...")
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_replace_team_execute') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, oldCaptainId, newTeamDbId] = params;

        try {
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) throw new Error('Torneo no encontrado.');

            const oldTeam = tournament.teams.aprobados[oldCaptainId];
            if (!oldTeam) throw new Error('El equipo a sustituir ya no está en el torneo.');

            const { ObjectId } = await import('mongodb');
            const newTeamDoc = await db.collection('teams').findOne({ _id: new ObjectId(newTeamDbId) });
            if (!newTeamDoc) throw new Error('Equipo de reemplazo no encontrado en la base de datos.');

            const newCaptainId = newTeamDoc.managerId;
            const newCaptainUser = await client.users.fetch(newCaptainId).catch(() => null);
            if (!newCaptainUser) throw new Error('El mánager del equipo de reemplazo no se encontró en Discord.');

            if (tournament.teams.aprobados[newCaptainId]) {
                throw new Error('El equipo de reemplazo ya está inscrito en este torneo.');
            }

            const newTeam = {
                ...oldTeam,
                id: newCaptainId,
                nombre: newTeamDoc.name,
                capitanId: newCaptainId,
                capitanTag: newCaptainUser.tag
            };

            const updateOps = {
                $set: { [`teams.aprobados.${newCaptainId}`]: newTeam },
                $unset: { [`teams.aprobados.${oldCaptainId}`]: "" }
            };

            // Roles
            try {
                const captainRole = tournament.discordRoleIds?.capitanesId;
                if (captainRole) {
                    const oldM = await interaction.guild.members.fetch(oldCaptainId).catch(() => null);
                    if (oldM) await oldM.roles.remove(captainRole).catch(() => null);
                    const newM = await interaction.guild.members.fetch(newCaptainId).catch(() => null);
                    if (newM) await newM.roles.add(captainRole).catch(() => null);
                }
            } catch(e) {}

            // Actualizar calendario (grupos)
            if (tournament.structure?.calendario) {
                for (const [gn, matches] of Object.entries(tournament.structure.calendario)) {
                    matches.forEach((m, i) => {
                        if (m.equipoA?.capitanId === oldCaptainId) {
                            updateOps.$set[`structure.calendario.${gn}.${i}.equipoA.capitanId`] = newCaptainId;
                            updateOps.$set[`structure.calendario.${gn}.${i}.equipoA.capitanTag`] = newCaptainUser.tag;
                            updateOps.$set[`structure.calendario.${gn}.${i}.equipoA.id`] = newCaptainId;
                            updateOps.$set[`structure.calendario.${gn}.${i}.equipoA.nombre`] = newTeamDoc.name;
                        }
                        if (m.equipoB?.capitanId === oldCaptainId) {
                            updateOps.$set[`structure.calendario.${gn}.${i}.equipoB.capitanId`] = newCaptainId;
                            updateOps.$set[`structure.calendario.${gn}.${i}.equipoB.capitanTag`] = newCaptainUser.tag;
                            updateOps.$set[`structure.calendario.${gn}.${i}.equipoB.id`] = newCaptainId;
                            updateOps.$set[`structure.calendario.${gn}.${i}.equipoB.nombre`] = newTeamDoc.name;
                        }
                    });
                }
            }

            // Actualizar eliminatorias
            if (tournament.structure?.eliminatorias?.rondaActual) {
                Object.keys(tournament.structure.eliminatorias).forEach(rd => {
                    if (rd === 'rondaActual') return;
                    const rData = tournament.structure.eliminatorias[rd];
                    const mList = Array.isArray(rData) ? rData : [rData];
                    const isArr = Array.isArray(rData);
                    mList.forEach((m, i) => {
                        const bp = isArr ? `structure.eliminatorias.${rd}.${i}` : `structure.eliminatorias.${rd}`;
                        if (m.equipoA?.capitanId === oldCaptainId) {
                            updateOps.$set[`${bp}.equipoA.capitanId`] = newCaptainId;
                            updateOps.$set[`${bp}.equipoA.capitanTag`] = newCaptainUser.tag;
                            updateOps.$set[`${bp}.equipoA.id`] = newCaptainId;
                            updateOps.$set[`${bp}.equipoA.nombre`] = newTeamDoc.name;
                        }
                        if (m.equipoB?.capitanId === oldCaptainId) {
                            updateOps.$set[`${bp}.equipoB.capitanId`] = newCaptainId;
                            updateOps.$set[`${bp}.equipoB.capitanTag`] = newCaptainUser.tag;
                            updateOps.$set[`${bp}.equipoB.id`] = newCaptainId;
                            updateOps.$set[`${bp}.equipoB.nombre`] = newTeamDoc.name;
                        }
                    });
                });
            }

            // Actualizar grupos (clasificación)
            if (tournament.structure?.grupos) {
                for (const [gn, gd] of Object.entries(tournament.structure.grupos)) {
                    if (gd?.equipos) {
                        gd.equipos.forEach((eq, i) => {
                            if (eq.capitanId === oldCaptainId) {
                                updateOps.$set[`structure.grupos.${gn}.equipos.${i}.capitanId`] = newCaptainId;
                                updateOps.$set[`structure.grupos.${gn}.equipos.${i}.capitanTag`] = newCaptainUser.tag;
                                updateOps.$set[`structure.grupos.${gn}.equipos.${i}.id`] = newCaptainId;
                                updateOps.$set[`structure.grupos.${gn}.equipos.${i}.nombre`] = newTeamDoc.name;
                            }
                        });
                    }
                }
            }

            await db.collection('tournaments').updateOne({ _id: tournament._id }, updateOps);

            const { replaceManagerInThreads } = await import('../utils/tournamentUtils.js');
            await replaceManagerInThreads(client, interaction.guild, tournament, oldCaptainId, newCaptainId);

            const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
            const { updateTournamentManagementThread } = await import('../utils/panelManager.js');
            const { updatePublicMessages, notifyTournamentVisualizer } = await import('../logic/tournamentLogic.js');
            await updateTournamentManagementThread(client, updatedTournament);
            await updatePublicMessages(client, updatedTournament);
            await notifyTournamentVisualizer(updatedTournament);

            await interaction.editReply({
                content: `✅ **Equipo sustituido con éxito!**\n🔴 Sale: **${oldTeam.nombre}** (<@${oldCaptainId}>)\n🟢 Entra: **${newTeamDoc.name}** (<@${newCaptainId}>)\n\nTodas las referencias han sido actualizadas.`
            });
        } catch (error) {
            console.error('[REPLACE TEAM] Error:', error);
            await interaction.editReply({ content: `❌ Error al sustituir equipo: ${error.message}` });
        }
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

    if (action === 'admin_regenerate_panel_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const activeTournaments = await db.collection('tournaments').find({}).sort({ _id: -1 }).limit(25).toArray();

        if (activeTournaments.length === 0) {
            return interaction.editReply({ content: '❌ No hay torneos activos para regenerar.' });
        }

        const tournamentOptions = activeTournaments.map(t => ({
            label: t.nombre,
            description: `Estado: ${t.status} | ID: ${t.shortId}`,
            value: t.shortId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_regenerate_panel_select')
            .setPlaceholder('Selecciona el torneo cuyo panel quieres regenerar')
            .addOptions(tournamentOptions);

        await interaction.editReply({
            content: '🔄 **Regenerar Panel de Gestión**\nSelecciona el torneo cuyo panel quieres forzar a regenerar:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action.startsWith('admin_panel_')) {
        try {
            const view = action.replace('admin_panel_', '');
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

        const { DRAFT_POSITIONS } = await import('../../config.js');
        const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({
            label: value,
            value: key,
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_manual_cap_pos:${draftShortId}`)
            .setPlaceholder('Selecciona la posición PRINCIPAL del capitán')
            .addOptions(positionOptions);

        await interaction.reply({
            content: 'Para añadir a un capitán manualmente, primero selecciona su posición primaria:',
            components: [new ActionRowBuilder().addComponents(selectMenu)],
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

    // [DUPLICADO ELIMINADO] captain_pick_start — la versión correcta con isPicking está más abajo (L1551+)

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
                description: `${player.userName}`,
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
        const { updatePublicMessages } = await import('../logic/tournamentLogic.js');
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

    if (action === 'admin_toggle_ea_scanner') {
        await interaction.deferUpdate();
        const currentSettings = await getBotSettings();
        const newState = !currentSettings.eaScannerEnabled;
        await updateBotSettings({ eaScannerEnabled: newState });
        await updateAdminPanel(client);
        await interaction.followUp({ content: `✅ El Recolector de Estadísticas de EA Sports ha sido **${newState ? 'ACTIVADO' : 'DESACTIVADO'}**.`, flags: [MessageFlags.Ephemeral] });
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

    if (action === 'scout_heights') {
        const [matchId, tournamentShortId] = params;
        
        // Verificación de configuración global
        const { getBotSettings } = await import('../../database.js');
        const currentSettings = await getBotSettings();
        if (!currentSettings || !currentSettings.eaScannerEnabled) {
            return interaction.reply({ content: '❌ El escáner de EA Sports está desactivado globalmente.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: '❌ Torneo no encontrado.' });

        const { partido } = findMatch(tournament, matchId);
        if (!partido) return interaction.editReply({ content: '❌ Partido no encontrado.' });

        // Identificar si pertenece al equipo A o B
        const isTeamA = (partido.equipoA.id === interaction.user.id) || (tournament.teams?.aprobados?.[interaction.user.id]?.id === partido.equipoA.id) || (tournament.teams?.aprobados?.[partido.equipoA.id]?.coCaptainId === interaction.user.id) || (tournament.teams?.aprobados?.[partido.equipoA.id]?.extraCaptains?.includes(interaction.user.id));
        const isTeamB = (partido.equipoB.id === interaction.user.id) || (tournament.teams?.aprobados?.[interaction.user.id]?.id === partido.equipoB.id) || (tournament.teams?.aprobados?.[partido.equipoB.id]?.coCaptainId === interaction.user.id) || (tournament.teams?.aprobados?.[partido.equipoB.id]?.extraCaptains?.includes(interaction.user.id));

        if (!isTeamA && !isTeamB) {
            return interaction.editReply({ content: '❌ No perteneces a ninguno de los dos equipos de este partido.' });
        }

        const userTeamLabel = isTeamA ? partido.equipoA.nombre : partido.equipoB.nombre;

        // Comprobar si ya se pidió (usando historial de mensajes del hilo)
        const messages = await interaction.channel.messages.fetch({ limit: 50 });
        const alreadyScouted = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title === '📏 SCOUTING - Alturas y Posiciones' && m.embeds[0].footer?.text?.includes(`Solicitado por: ${userTeamLabel}`));

        if (alreadyScouted) {
            return interaction.editReply({ content: `❌ Tu equipo (${userTeamLabel}) ya ha utilizado su solicitud de Scouting para este partido.` });
        }

        // Buscar eaClubId de ambos equipos
        const teamA_Data = await db.collection('teams').findOne({ $or: [{ managerId: partido.equipoA.id }, { captains: partido.equipoA.id }] });
        const teamB_Data = await db.collection('teams').findOne({ $or: [{ managerId: partido.equipoB.id }, { captains: partido.equipoB.id }] });

        if (!teamA_Data || !teamA_Data.eaClubId || !teamB_Data || !teamB_Data.eaClubId) {
            return interaction.editReply({ content: '❌ Al menos uno de los dos equipos no tiene configurado su Club de EA Sports en el sistema.' });
        }

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json',
            'Origin': 'https://www.ea.com',
            'Referer': 'https://www.ea.com/'
        };

        const fetchTeamScout = async (clubId, platform) => {
            // 1. Fetch matches para saber quién jugó el último partido (así filtramos a los suplentes/gente offline)
            const urlMatches = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${clubId}&platform=${platform}&matchType=friendlyMatch`;
            const resMatches = await fetch(urlMatches, { headers }).catch(() => null);
            let playedNames = [];
            if (resMatches && resMatches.ok) {
                const dataM = await resMatches.json().catch(() => []);
                const matches = Array.isArray(dataM) ? dataM : Object.values(dataM || {});
                matches.sort((a, b) => b.timestamp - a.timestamp);
                if (matches.length > 0) {
                    const lastMatch = matches[0];
                    if (lastMatch.players && lastMatch.players[String(clubId)]) {
                        playedNames = Object.values(lastMatch.players[String(clubId)]).map(p => p.playername);
                    }
                }
            }

            // 2. Fetch stats para sacar las alturas
            const urlStats = `https://proclubs.ea.com/api/fc/members/stats?clubIds=${clubId}&platform=${platform}`;
            const resStats = await fetch(urlStats, { headers }).catch(() => null);
            let members = [];
            if (resStats && resStats.ok) {
                const dataS = await resStats.json().catch(() => ({}));
                if (dataS.members) members = dataS.members;
            }

            // Mapeo de posiciones
            const posMap = {
                0: 'POR', 1: 'DFD', 2: 'DFC', 3: 'DFI', 4: 'CAD', 5: 'CAI',
                6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
                11: 'EDD', 12: 'EDI', 13: 'SD', 14: 'DC'
            };

            const playersData = [];
            for (const member of members) {
                if (playedNames.length > 0 && !playedNames.includes(member.name)) continue;

                const posId = member.proPos;
                const posName = posMap[posId] || `POS ${posId}`;
                const height = member.proHeight || '?';
                
                playersData.push({
                    name: member.name,
                    posName,
                    posId: parseInt(posId) || 99,
                    height
                });
            }

            // Ordenar por ID de posición (0 = Portero, 14 = DC)
            playersData.sort((a, b) => a.posId - b.posId);
            return playersData;
        };

        const [scoutA, scoutB] = await Promise.all([
            fetchTeamScout(teamA_Data.eaClubId, teamA_Data.eaPlatform),
            fetchTeamScout(teamB_Data.eaClubId, teamB_Data.eaPlatform)
        ]);

        const buildEmbedsForTeam = (teamName, isLocal, players) => {
            const embeds = [];
            const emoji = isLocal ? '🏠' : '✈️';
            
            if (!players || players.length === 0) {
                 const e = new EmbedBuilder().setColor('Green').setDescription(`${emoji} **${teamName}**\n*No se encontraron datos recientes en EA.*`);
                 embeds.push(e);
                 return embeds;
            }
            
            // Dividir en bloques de 25 jugadores
            for (let i = 0; i < players.length; i += 25) {
                const chunk = players.slice(i, i + 25);
                const text = chunk.map(p => `\`${p.posName.padEnd(3)}\` | **${p.name.padEnd(16)}** | ${p.height} cm`).join('\n');
                const titleText = i === 0 ? `${emoji} **${teamName}**` : `${emoji} **${teamName}** (Cont.)`;
                const e = new EmbedBuilder().setColor('Green').setDescription(`${titleText}\n${text}`);
                embeds.push(e);
            }
            return embeds;
        };

        const allEmbeds = [
            ...buildEmbedsForTeam(partido.equipoA.nombre, true, scoutA),
            ...buildEmbedsForTeam(partido.equipoB.nombre, false, scoutB)
        ];
        
        // Añadir título al primer embed y footer al último
        if (allEmbeds.length > 0) {
            allEmbeds[0].setTitle('📏 SCOUTING - Alturas y Posiciones');
            allEmbeds[allEmbeds.length - 1].setFooter({ text: `Solicitado por: ${userTeamLabel} | Solo 1 uso por equipo` }).setTimestamp();
        }

        await interaction.channel.send({ embeds: allEmbeds });
        return interaction.editReply({ content: '✅ Scouting completado. Resultado publicado en el hilo.' });
    }

    const modalActions = ['admin_modify_result_start', 'payment_confirm_start', 'admin_add_test_teams', 'admin_edit_tournament_start', 'admin_rename_tournament', 'report_result_start'];
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

            if (tournament.config.formatId === 'flexible_league') {
                const qualifiersInput = new TextInputBuilder()
                    .setCustomId('torneo_qualifiers')
                    .setLabel("Nº de Equipos que se Clasifican")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setValue((tournament.config.qualifiers || 0).toString());
                modal.addComponents(new ActionRowBuilder().addComponents(qualifiersInput));
            }
        } else if (action === 'admin_rename_tournament') {
            modal = new ModalBuilder().setCustomId(`rename_tournament_modal:${tournamentShortId}`).setTitle('Renombrar Torneo');
            const nameInput = new TextInputBuilder().setCustomId('new_tournament_name').setLabel("Nuevo nombre del torneo").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.nombre).setMaxLength(100);
            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
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

    if (action === 'remove_cocaptain') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: 'Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });

        try {
            const { removeCoCaptain } = await import('../logic/tournamentLogic.js');
            const result = await removeCoCaptain(interaction.client, tournament, interaction.user.id);
            if (result.success) {
                await interaction.reply({ content: '✅ Co-capitán expulsado correctamente. Sus permisos han sido retirados.', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: `❌ No se pudo expulsar: ${result.error}`, flags: [MessageFlags.Ephemeral] });
            }
        } catch (err) {
            console.error('Error expulsando co-capitán:', err);
            await interaction.reply({ content: '❌ Hubo un error al intentar expulsar al co-capitán.', flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    if (action === 'cancel_captain_registration') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const managerId = interaction.user.id;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Torneo no encontrado.' });

        // Ensure they are not approved
        if (tournament.teams.aprobados?.[managerId]) {
            return interaction.editReply({ content: '❌ Tu equipo ya ha sido aprobado en el torneo. No puedes cancelar la inscripción automáticamente. Por favor, contacta con un administrador.' });
        }

        const isPending = tournament.teams.pendientes?.[managerId] || tournament.teams.pendingApproval?.[managerId] || tournament.teams.pendingPayments?.[managerId];
        
        if (!isPending) {
            return interaction.editReply({ content: '❌ No se encontró tu inscripción como capitán pendiente.' });
        }

        try {
            // Remove co-captain if exists (removes roles/permissions automatically)
            if (isPending.coCaptainId) {
                const { removeCoCaptain } = await import('../logic/tournamentLogic.js');
                await removeCoCaptain(interaction.client, tournament, managerId);
            }

            // Remove team from all possible pending lists
            const unsetObj = {};
            if (tournament.teams.pendientes?.[managerId]) unsetObj[`teams.pendientes.${managerId}`] = '';
            if (tournament.teams.pendingApproval?.[managerId]) unsetObj[`teams.pendingApproval.${managerId}`] = '';
            if (tournament.teams.pendingPayments?.[managerId]) unsetObj[`teams.pendingPayments.${managerId}`] = '';

            if (Object.keys(unsetObj).length > 0) {
                await db.collection('tournaments').updateOne(
                    { shortId: tournamentShortId },
                    { $unset: unsetObj }
                );
            }

            // Update registration list if needed
            const { scheduleRegistrationListUpdate } = await import('../utils/registrationListManager.js');
            scheduleRegistrationListUpdate(client, tournamentShortId);

            await interaction.editReply({ content: '✅ **Inscripción cancelada con éxito.**\nTu equipo ha sido eliminado de la lista de capitanes pendientes.' });
            
            // Try to DM the user
            try {
                await interaction.user.send(`✅ Has cancelado con éxito tu postulación para capitán en el torneo **${tournament.nombre}**.`);
            } catch (e) {
                // Ignore DM errors
            }
        } catch (error) {
            console.error('[CANCEL CAPTAIN] Error:', error);
            await interaction.editReply({ content: '❌ Hubo un error al cancelar tu inscripción.' });
        }
        return;
    }

    if (action === 'admin_kick_cocaptain') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Torneo no encontrado.' });

        try {
            const { removeCoCaptain } = await import('../logic/tournamentLogic.js');
            const result = await removeCoCaptain(interaction.client, tournament, captainId);
            if (result.success) {
                await interaction.editReply({ content: '✅ **Ayudante expulsado correctamente (Vía Admin).**\nSe le han retirado todos los permisos al antiguo ayudante.' });
            } else {
                await interaction.editReply({ content: `❌ No se pudo expulsar: ${result.error}` });
            }
        } catch (err) {
            console.error('[ADMIN KICK COCAPTAIN] Error:', err);
            await interaction.editReply({ content: '❌ Hubo un error al intentar expulsar al ayudante.' });
        }
        return;
    }

    if (action === 'admin_edit_rules_url') {
        const modal = new ModalBuilder().setCustomId('admin_edit_rules_url_modal').setTitle('Editar Link Normativa');
        const urlInput = new TextInputBuilder()
            .setCustomId('rules_url_input')
            .setLabel("Nuevo URL de Normativa")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://i.imgur.com/logo.png')
            .setRequired(true);
            
        modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_manage_elo') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const settings = await getBotSettings();
        
        const configPlayoff = settings?.eloConfig?.playoff || { champion: 150, runner_up: 80, semifinalist: 40, quarterfinalist: 15, round_of_16: -20, groups_top_half: -30, groups_bottom_half: -50 };
        const configLeague = settings?.eloConfig?.league || { first: 120, second: 75, third: 40, top_half: 15, bottom_half: -35, last: -60 };

        const embed = new EmbedBuilder()
            .setTitle('📈 Configuración ELO Actual')
            .setColor('Blue')
            .setDescription('Aquí puedes ver y modificar la configuración base del ELO que se reparte al finalizar los torneos.')
            .addFields(
                { name: '🏆 PLAYOFFS (Torneos con eliminatorias)', value: 
`Campeón: **${configPlayoff.champion > 0 ? '+'+configPlayoff.champion : configPlayoff.champion}**
Finalista: **${configPlayoff.runner_up > 0 ? '+'+configPlayoff.runner_up : configPlayoff.runner_up}**
Semifinales: **${configPlayoff.semifinalist > 0 ? '+'+configPlayoff.semifinalist : configPlayoff.semifinalist}**
Cuartos: **${configPlayoff.quarterfinalist > 0 ? '+'+configPlayoff.quarterfinalist : configPlayoff.quarterfinalist}**
Octavos: **${configPlayoff.round_of_16 > 0 ? '+'+configPlayoff.round_of_16 : configPlayoff.round_of_16}**
Grupos (Zona Alta): **${configPlayoff.groups_top_half > 0 ? '+'+configPlayoff.groups_top_half : configPlayoff.groups_top_half}**
Grupos (Zona Baja): **${configPlayoff.groups_bottom_half > 0 ? '+'+configPlayoff.groups_bottom_half : configPlayoff.groups_bottom_half}**` },
                { name: '📊 LIGA PURA (Sin Playoff)', value: 
`1º Puesto: **${configLeague.first > 0 ? '+'+configLeague.first : configLeague.first}**
2º Puesto: **${configLeague.second > 0 ? '+'+configLeague.second : configLeague.second}**
3º Puesto: **${configLeague.third > 0 ? '+'+configLeague.third : configLeague.third}**
Mitad Superior: **${configLeague.top_half > 0 ? '+'+configLeague.top_half : configLeague.top_half}**
Mitad Inferior: **${configLeague.bottom_half > 0 ? '+'+configLeague.bottom_half : configLeague.bottom_half}**
Último Puesto: **${configLeague.last > 0 ? '+'+configLeague.last : configLeague.last}**` }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_modify_elo_percentage').setLabel('Modificar Porcentaje').setStyle(ButtonStyle.Primary).setEmoji('✏️')
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        return;
    }

    if (action === 'admin_modify_elo_percentage') {
        const modal = new ModalBuilder().setCustomId('admin_modify_elo_percentage_modal').setTitle('Modificar Valores ELO (%)');
        const percentageInput = new TextInputBuilder()
            .setCustomId('elo_percentage_input')
            .setLabel("Porcentaje (Ej: -30 reducir, 50 aumentar)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('-30')
            .setRequired(true);
            
        modal.addComponents(new ActionRowBuilder().addComponents(percentageInput));
        await interaction.showModal(modal);
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

            // --- FIX: Revisar si estamos CREANDO o EDITANDO un formato ---
            if (pendingData.action === 'edit_format') {
                const { targetTournamentShortId, newFormatId, qualifiers } = pendingData;

                await updateTournamentConfig(client, targetTournamentShortId, {
                    formatId: newFormatId,
                    leagueMode: 'round_robin',
                    qualifiers: qualifiers
                });

                await interaction.editReply(`✅ Formato actualizado a: **Liguilla Flexible (Todos contra Todos)** con ${qualifiers} clasificados.`);
                await db.collection('pending_tournaments').deleteOne({ pendingId });
                return;
            }
            // --- FIN FIX ---

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

        // NUEVO: Comprobar roles de admin/árbitro
        const isAdminOrRef = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.roles.cache.has(ARBITRO_ROLE_ID);
        const showWhatsapp = isAdminOrRef;

        let description = '🇪🇸 Aún no hay equipos inscritos.\n🇬🇧 No teams have registered yet.';

        if (approvedTeams.length > 0) {
            const approvedStrings = await Promise.all(approvedTeams.map(async (team, index) => {
                let teamString = `${index + 1}. **${team.nombre}**\n   👤 Cap: \`${team.capitanTag}\``;
                if (team.coCaptainTag) teamString += ` | Co-Cap: \`${team.coCaptainTag}\``;

                if (showWhatsapp) {
                    let whatsapp = team.whatsapp;
                    if (!whatsapp) {
                        let capitanData = await db.collection('users_vpg').findOne({ discordId: team.capitanId });
                        if (capitanData && capitanData.whatsapp) {
                            whatsapp = capitanData.whatsapp;
                        } else {
                            capitanData = await db.collection('verified_users').findOne({ discordId: team.capitanId });
                            if (capitanData && capitanData.whatsapp) whatsapp = capitanData.whatsapp;
                        }
                    }
                    if (whatsapp) teamString += `\n   📱 WA: **${whatsapp}**`;
                }
                return teamString + '\n';
            }));
            description = approvedStrings.join('\n');
        }

        if (waitlistedTeams.length > 0) {
            const waitlistStrings = await Promise.all(waitlistedTeams.map(async (team, index) => {
                let teamString = `${index + 1}. **${team.nombre}** (Cap: ${team.capitanTag})`;

                if (showWhatsapp) {
                    let whatsapp = team.whatsapp;
                    if (!whatsapp) {
                        let capitanData = await db.collection('users_vpg').findOne({ discordId: team.capitanId });
                        if (capitanData && capitanData.whatsapp) {
                            whatsapp = capitanData.whatsapp;
                        } else {
                            capitanData = await db.collection('verified_users').findOne({ discordId: team.capitanId });
                            if (capitanData && capitanData.whatsapp) whatsapp = capitanData.whatsapp;
                        }
                    }
                    if (whatsapp) teamString += ` - 📱 ${whatsapp}`;
                }
                return teamString;
            }));
            const waitlistDescription = waitlistStrings.join('\n');

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
        // Filtramos la lista para mostrar los formatos de grupos y el de solo eliminatorias
        const groupFormats = Object.entries(TOURNAMENT_FORMATS)
            .filter(([key, format]) => format.size > 0 || key === 'knockout_only')
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
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        await interaction.editReply({ content: '⏳ **Recibido.** Iniciando el proceso para revertir el sorteo. Esto puede tardar unos segundos...' });
        try {
            const knockoutStageNames = ['treintaidosavos', 'dieciseisavos', 'octavos', 'cuartos', 'semifinales', 'final'];
            if (knockoutStageNames.includes(tournament.status)) {
                const { undoKnockoutDraw } = await import('../logic/tournamentLogic.js');
                await undoKnockoutDraw(client, tournamentShortId);
            } else {
                await undoGroupStageDraw(client, tournamentShortId);
            }
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

        // --- DAR PERMISO VOZ CANAL B (Aprobados) - background ---
        if (tournament.config?.isPaid && tournament.discordMessageIds?.capitanesAprobadosVoiceId) {
            client.channels.fetch(tournament.discordMessageIds.capitanesAprobadosVoiceId).then(vc => {
                if (vc) vc.permissionOverwrites.create(captainId, { ViewChannel: true, Connect: true, Speak: true }).catch(e => console.error('[VOZ] Error Canal B approve:', e));
            }).catch(() => { });
        }

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

        // --- GUARDAR EN RECHAZADOS + QUITAR VOZ CANAL A ---
        if (tournament.config?.isPaid) {
            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.rechazados.${captainId}`]: { rejectedAt: new Date() } } }
            );

            // Quitar permiso Canal A (background)
            const seleccionVoiceId = tournament.discordMessageIds?.seleccionCapitanesVoiceId;
            if (seleccionVoiceId) {
                client.channels.fetch(seleccionVoiceId).then(vc => {
                    if (vc) vc.permissionOverwrites.delete(captainId).catch(e => console.error('[VOZ] Error quitando permiso Canal A:', e));
                }).catch(() => { });
            }
        }
        // --- FIN RECHAZADOS ---

        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Rechazado por ${interaction.user.tag}` }).setColor('#e74c3c');

        // Botón de desbloquear (solo para torneos de pago)
        const newComponents = [];
        if (tournament.config?.isPaid) {
            newComponents.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_unblock_user:${captainId}:${tournamentShortId}`)
                    .setLabel('🔓 Desbloquear / Unblock')
                    .setStyle(ButtonStyle.Secondary)
            ));
        } else {
            const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
            disabledRow.components.forEach(c => c.setDisabled(true));
            newComponents.push(disabledRow);
        }

        await originalMessage.edit({ embeds: [originalEmbed], components: newComponents });
        await interaction.editReply(`❌ Equipo rechazado y capitán notificado.`);
        return;
    }

    // --- NUEVO: DESBLOQUEAR USUARIO RECHAZADO ---
    if (action === 'admin_unblock_user') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [userId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        // Eliminar de rechazados
        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            { $unset: { [`teams.rechazados.${userId}`]: '' } }
        );

        // Restaurar permiso Canal A (background)
        const seleccionVoiceId = tournament.discordMessageIds?.seleccionCapitanesVoiceId;
        if (seleccionVoiceId) {
            client.channels.fetch(seleccionVoiceId).then(vc => {
                if (vc) vc.permissionOverwrites.create(userId, { ViewChannel: true, Connect: true, Speak: true }).catch(e => console.error('[VOZ] Error restaurando permiso Canal A:', e));
            }).catch(() => { });
        }

        // Notificar al usuario por DM
        try {
            const user = await client.users.fetch(userId);
            await user.send(`🔓 Has sido desbloqueado del torneo **${tournament.nombre}**. Ya puedes volver a inscribirte.`);
        } catch (e) { console.warn(`No se pudo notificar desbloqueo a ${userId}`); }

        // Deshabilitar botón de desbloqueo
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Desbloqueado por ${interaction.user.tag}` }).setColor('#f1c40f');
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });

        await interaction.editReply(`🔓 Usuario <@${userId}> desbloqueado. Ya puede volver a inscribirse.`);
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

        // --- ELIMINAR CANAL A (Selección) ---
        const seleccionVoiceId = tournament.discordMessageIds?.seleccionCapitanesVoiceId;
        if (seleccionVoiceId) {
            client.channels.fetch(seleccionVoiceId).then(vc => {
                if (vc) vc.delete('Sorteo forzado - Canal de selección eliminado').catch(e => console.error('[VOZ] Error eliminando Canal A:', e));
            }).catch(() => { });
        }
        // --- FIN ELIMINAR CANAL A ---

        // SI ES SOLO ELIMINATORIAS, SE OFRECE FORMATO MANUAL/ALEATORIO
        if (tournament.config.formatId === 'knockout_only') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_knockout_random:${tournament.shortId}`).setLabel('Sorteo Rápido / Aleatorio').setStyle(ButtonStyle.Primary).setEmoji('🎲'),
                new ButtonBuilder().setCustomId(`admin_knockout_manual:${tournament.shortId}`).setLabel('Emparejamiento Manual').setStyle(ButtonStyle.Success).setEmoji('🛠️')
            );
            return interaction.editReply({
                content: `🏆 **Formato Detectado: Solo Eliminatorias**\n\nEquipos inscritos: **${Object.keys(tournament.teams.aprobados).length}**.\nSi el número no es simétrico, el bot asignará Pases Directos (Byes) automáticamente para encajar el cuadro.\n\n¿Cómo deseas emparejar los equipos de la primera ronda?`,
                components: [row]
            });
        }

        // SI ES LIGUILLA FLEXIBLE, SE OFRECE CONSTRUCTOR MANUAL / ALEATORIO
        if (tournament.config.formatId === 'flexible_league') {
            const teamCount = Object.keys(tournament.teams.aprobados).length;
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_league_random:${tournament.shortId}`).setLabel('Sorteo Aleatorio').setStyle(ButtonStyle.Primary).setEmoji('🎲'),
                new ButtonBuilder().setCustomId(`admin_league_manual:${tournament.shortId}`).setLabel('Constructor Manual').setStyle(ButtonStyle.Success).setEmoji('🛠️')
            );
            return interaction.editReply({
                content: `📅 **Formato Detectado: Liguilla Flexible**\n\nEquipos inscritos: **${teamCount}**.\n\n¿Cómo deseas generar el calendario?\n• **Sorteo Aleatorio**: El bot genera automáticamente todas las jornadas.\n• **Constructor Manual**: Tú eliges quién juega contra quién en cada jornada.`,
                components: [row]
            });
        }

        await interaction.editReply({ content: `✅ Orden recibida. El sorteo para **${tournament.nombre}** ha comenzado en segundo plano. Esto puede tardar varios minutos.` });

        startGroupStage(client, guild, tournament)
            .then(() => { if (interaction.channel) { interaction.channel.send(`🎲 ¡El sorteo para **${tournament.nombre}** ha finalizado y la Jornada 1 ha sido creada!`); } })
            .catch(error => { console.error("Error durante el sorteo en segundo plano:", error); if (interaction.channel) { interaction.channel.send(`❌ Ocurrió un error crítico durante el sorteo para **${tournament.nombre}**. Revisa los logs.`); } });
        return;
    }

    if (action === 'admin_knockout_random') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        if (Object.keys(tournament.teams.aprobados).length < 2) return interaction.editReply({ content: 'Se necesitan al menos 2 equipos para forzar el sorteo.' });

        await interaction.editReply({ content: `✅ Orden recibida. El sorteo rápido para **${tournament.nombre}** ha comenzado en segundo plano.` });

        startKnockoutOnlyDraw(client, guild, tournament, 'random')
            .then(() => { if (interaction.channel) { interaction.channel.send(`🎲 ¡El sorteo de Eliminatorias para **${tournament.nombre}** ha finalizado y los encuentros han sido creados!`); } })
            .catch(error => { console.error("Error en sorteo knockout:", error); if (interaction.channel) { interaction.channel.send(`❌ Ocurrió un error crítico durante el sorteo. Revisa los logs.`); } });
        return;
    }

    if (action === 'admin_knockout_manual') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        // Generate Select Menus for manual matchups (max 25 teams per select menu, we can just use 1 select menu for Equipo A and 1 for Equipo B if we track state)
        // For simplicity, we just trigger the command that creates a "Matchmaking Builder"
        // Let's create an external interactive state in selectMenuHandler. We just send the initial message here.
        
        const builderEmbed = new EmbedBuilder()
            .setTitle('🛠️ Constructor de Cuadro (Manual)')
            .setDescription(`**Instrucciones:**\n1. Usa los botones abajo para elegir los dos equipos del siguiente emparejamiento.\n2. También puedes añadir 'Pases Directos' (Ghosts) manualmente.\n3. Una vez todos los equipos estén emparejados, confirma el sorteo.\n\n*Equipos pendientes de emparejar: ${Object.keys(tournament.teams.aprobados).length}*`)
            .setColor('#2ECC71');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`setup_knockout_pair:${tournament.shortId}`).setLabel('Añadir Enfrentamiento').setStyle(ButtonStyle.Primary).setEmoji('➕'),
            new ButtonBuilder().setCustomId(`reset_knockout_pairs:${tournament.shortId}`).setLabel('Resetear').setStyle(ButtonStyle.Danger).setEmoji('🔄'),
            new ButtonBuilder().setCustomId(`confirm_knockout_manual:${tournament.shortId}`).setLabel('Finalizar Sorteo').setStyle(ButtonStyle.Success).setEmoji('✅')
        );

        // Guardamos el estado del constructor temporal en la BD
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { "temp.manualDrawPairs": [] } } // Inicializamos vacío
        );

        await interaction.editReply({ embeds: [builderEmbed], components: [row] });
        return;
    }

    if (action === 'setup_knockout_pair') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        const approvedTeams = Object.values(tournament.teams.aprobados);
        const currentPairs = tournament.temp?.manualDrawPairs || [];
        const pairedTeams = new Set();
        currentPairs.forEach(p => {
            if (p.equipoA.id !== 'ghost') pairedTeams.add(p.equipoA.id);
            if (p.equipoB.id !== 'ghost') pairedTeams.add(p.equipoB.id);
        });

        const availableTeams = approvedTeams.filter(t => !pairedTeams.has(t.id));
        if (availableTeams.length === 0) return interaction.editReply({ content: 'Todos los equipos ya han sido emparejados. Pulsa "Finalizar Sorteo" en el mensaje principal.' });

        // Construir resumen visual
        let summary = '';
        if (currentPairs.length > 0) {
            summary = '**Emparejamientos actuales:**\n' + currentPairs.map((p, i) => `${i + 1}. ${p.equipoA.nombre} vs ${p.equipoB.nombre}`).join('\n');
            summary += `\n\n**Equipos restantes (${availableTeams.length}):**\n` + availableTeams.map(t => `• ${t.nombre}`).join('\n');
        } else {
            summary = `**No hay emparejamientos todavía.**\nEquipos disponibles: ${availableTeams.length}`;
        }

        const teamOptions = availableTeams.slice(0, 24).map(t => ({
            label: t.nombre.substring(0, 100),
            value: t.id
        }));
        
        teamOptions.push({ label: 'Pase Directo (Bye / Ghost)', value: 'ghost' });

        const selectA = new StringSelectMenuBuilder()
            .setCustomId(`select_manual_teamA:${tournamentShortId}`)
            .setPlaceholder('Elige Equipo A')
            .addOptions(teamOptions);

        const selectB = new StringSelectMenuBuilder()
            .setCustomId(`select_manual_teamB:${tournamentShortId}`)
            .setPlaceholder('Elige Equipo B')
            .addOptions(teamOptions);

        const rowA = new ActionRowBuilder().addComponents(selectA);
        const rowB = new ActionRowBuilder().addComponents(selectB);
        const rowActions = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`save_manual_pair:${tournamentShortId}`).setLabel('Guardar Partido').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`undo_knockout_pair:${tournamentShortId}`).setLabel('Deshacer Último').setStyle(ButtonStyle.Danger).setEmoji('↩️').setDisabled(currentPairs.length === 0)
        );

        await interaction.editReply({ content: summary, components: [rowA, rowB, rowActions] });
        return;
    }

    if (action === 'save_manual_pair') {
        await interaction.reply({ content: 'Por favor, utiliza los menús desplegables para emparejar equipos uno por uno. Una vez seleccionados, el bot los guardará automáticamente.', flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'reset_knockout_pairs') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'temp.manualDrawPairs': [] }, $unset: { 'temp.currentPairA': '', 'temp.currentPairB': '' } }
        );
        await interaction.editReply({ content: '🔄 Todos los emparejamientos reseteados. Pulsa "Añadir Enfrentamiento" para empezar de nuevo.' });
        return;
    }

    if (action === 'undo_knockout_pair') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const pairs = tournament.temp?.manualDrawPairs || [];
        if (pairs.length === 0) return interaction.editReply({ content: 'No hay emparejamientos que deshacer.' });
        const removed = pairs.pop();
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'temp.manualDrawPairs': pairs } }
        );
        await interaction.editReply({ content: `↩️ Deshecho: **${removed.equipoA.nombre}** vs **${removed.equipoB.nombre}**. Pulsa "Añadir Enfrentamiento" para continuar.` });
        return;
    }

    if (action === 'confirm_knockout_manual') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const pairs = tournament.temp?.manualDrawPairs || [];
        
        if (pairs.length === 0) return interaction.reply({ content: 'No hay enfrentamientos guardados todavía.', flags: [MessageFlags.Ephemeral] });

        await interaction.reply({ content: `✅ Finalizando el sorteo manual con ${pairs.length} partidos...` });

        startKnockoutOnlyDraw(client, guild, tournament, 'manual', pairs)
            .then(() => { if (interaction.channel) { interaction.channel.send(`🎲 ¡El sorteo Manual de Eliminatorias ha finalizado y los hilos han sido creados!`); } })
            .catch(error => { console.error("Error en sorteo manual knockout:", error); });
        return;
    }

    // =======================================================
    // --- TOGGLE + AVANCE MANUAL ENTRE RONDAS KNOCKOUT ---
    // =======================================================

    if (action === 'admin_toggle_manual_knockout') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        const newValue = !tournament.config.manualKnockoutPairing;
        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            { $set: { 'config.manualKnockoutPairing': newValue } }
        );

        const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
        const { updateTournamentManagementThread } = await import('../utils/panelManager.js');
        await updateTournamentManagementThread(client, updatedTournament);

        await interaction.editReply({
            content: newValue
                ? '✅ **Emparejamiento Manual activado.** Cuando una ronda termine, se te pedirá elegir los emparejamientos de la siguiente.'
                : '✅ **Emparejamiento Automático activado.** Las siguientes rondas se emparejarán al azar automáticamente.'
        });
        return;
    }

    if (action === 'admin_knockout_advance_auto') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        // Limpiar ganadores temporales y avanzar automáticamente
        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            { $unset: { 'temp.knockoutAdvanceWinners': '' } }
        );

        await interaction.editReply({ content: '✅ Avanzando automáticamente a la siguiente ronda...' });

        const { startNextKnockoutRound } = await import('../logic/tournamentLogic.js');
        startNextKnockoutRound(client, guild, tournament)
            .then(() => { if (interaction.channel) interaction.channel.send('🎲 ¡La siguiente ronda se ha generado automáticamente!'); })
            .catch(error => { console.error('Error en avance auto knockout:', error); if (interaction.channel) interaction.channel.send('❌ Error al generar la siguiente ronda. Revisa los logs.'); });
        return;
    }

    if (action === 'admin_knockout_advance_manual') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        const winners = tournament.temp?.knockoutAdvanceWinners || [];
        if (winners.length < 2) {
            return interaction.editReply({ content: '❌ No hay suficientes equipos clasificados para emparejar.' });
        }

        const builderEmbed = new EmbedBuilder()
            .setTitle('🛠️ Constructor de Cuadro — Siguiente Ronda')
            .setDescription(`**Instrucciones:**\n1. Usa el botón "Añadir Enfrentamiento" para crear parejas.\n2. Confirma cuando termines.\n\n*Equipos disponibles: ${winners.length}*\n\n**Clasificados:**\n${winners.map((g, i) => `${i + 1}. ${g.nombre}`).join('\n')}`)
            .setColor('#2ECC71');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`setup_advance_pair:${tournament.shortId}`).setLabel('Añadir Enfrentamiento').setStyle(ButtonStyle.Primary).setEmoji('➕'),
            new ButtonBuilder().setCustomId(`reset_advance_pairs:${tournament.shortId}`).setLabel('Resetear').setStyle(ButtonStyle.Danger).setEmoji('🔄'),
            new ButtonBuilder().setCustomId(`confirm_advance_manual:${tournament.shortId}`).setLabel('Confirmar Emparejamiento').setStyle(ButtonStyle.Success).setEmoji('✅')
        );

        // Inicializar estado temporal para pares de avance
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'temp.manualAdvancePairs': [] } }
        );

        await interaction.editReply({ embeds: [builderEmbed], components: [row] });
        return;
    }

    if (action === 'setup_advance_pair') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        const winners = tournament.temp?.knockoutAdvanceWinners || [];
        const currentPairs = tournament.temp?.manualAdvancePairs || [];
        const pairedTeams = new Set();
        currentPairs.forEach(p => {
            pairedTeams.add(p.equipoA.id);
            pairedTeams.add(p.equipoB.id);
        });

        const availableTeams = winners.filter(t => !pairedTeams.has(t.id));
        if (availableTeams.length < 2) return interaction.editReply({ content: 'No quedan suficientes equipos por emparejar. Pulsa "Confirmar Emparejamiento" en el mensaje principal.' });

        // Construir resumen visual
        let summary = '';
        if (currentPairs.length > 0) {
            summary = '**Emparejamientos actuales:**\n' + currentPairs.map((p, i) => `${i + 1}. ${p.equipoA.nombre} vs ${p.equipoB.nombre}`).join('\n');
            summary += `\n\n**Equipos restantes (${availableTeams.length}):**\n` + availableTeams.map(t => `• ${t.nombre}`).join('\n');
        } else {
            summary = `**No hay emparejamientos todavía.**\nEquipos disponibles: ${availableTeams.length}`;
        }

        const teamOptions = availableTeams.slice(0, 25).map(t => ({
            label: t.nombre.substring(0, 100),
            value: t.id
        }));

        const selectA = new StringSelectMenuBuilder()
            .setCustomId(`select_advance_teamA:${tournamentShortId}`)
            .setPlaceholder('Elige Equipo A')
            .addOptions(teamOptions);

        const selectB = new StringSelectMenuBuilder()
            .setCustomId(`select_advance_teamB:${tournamentShortId}`)
            .setPlaceholder('Elige Equipo B')
            .addOptions(teamOptions);

        const rowA = new ActionRowBuilder().addComponents(selectA);
        const rowB = new ActionRowBuilder().addComponents(selectB);
        const rowActions = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`save_advance_pair:${tournamentShortId}`).setLabel('Guardar Partido').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`undo_advance_pair:${tournamentShortId}`).setLabel('Deshacer Último').setStyle(ButtonStyle.Danger).setEmoji('↩️').setDisabled(currentPairs.length === 0)
        );

        await interaction.editReply({ content: summary, components: [rowA, rowB, rowActions] });
        return;
    }

    if (action === 'save_advance_pair') {
        await interaction.reply({ content: 'Por favor, utiliza los menús desplegables para emparejar equipos. Selecciona primero Equipo A, luego Equipo B.', flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'reset_advance_pairs') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'temp.manualAdvancePairs': [] }, $unset: { 'temp.currentAdvancePairA': '', 'temp.currentAdvancePairB': '' } }
        );
        await interaction.editReply({ content: '🔄 Todos los emparejamientos reseteados. Pulsa "Añadir Enfrentamiento" para empezar de nuevo.' });
        return;
    }

    if (action === 'undo_advance_pair') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const pairs = tournament.temp?.manualAdvancePairs || [];
        if (pairs.length === 0) return interaction.editReply({ content: 'No hay emparejamientos que deshacer.' });
        const removed = pairs.pop();
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'temp.manualAdvancePairs': pairs } }
        );
        await interaction.editReply({ content: `↩️ Deshecho: **${removed.equipoA.nombre}** vs **${removed.equipoB.nombre}**. Pulsa "Añadir Enfrentamiento" para continuar.` });
        return;
    }

    if (action === 'confirm_advance_manual') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const pairs = tournament.temp?.manualAdvancePairs || [];
        const winners = tournament.temp?.knockoutAdvanceWinners || [];

        if (pairs.length === 0) return interaction.reply({ content: 'No hay enfrentamientos guardados todavía.', flags: [MessageFlags.Ephemeral] });

        // Verificar que todos los equipos estén emparejados
        const pairedIds = new Set();
        pairs.forEach(p => { pairedIds.add(p.equipoA.id); pairedIds.add(p.equipoB.id); });
        const unpairedWinners = winners.filter(w => !pairedIds.has(w.id));

        if (unpairedWinners.length > 0) {
            return interaction.reply({
                content: `⚠️ Hay **${unpairedWinners.length} equipos** sin emparejar:\n${unpairedWinners.map(w => `• ${w.nombre}`).join('\n')}\n\nAñade más enfrentamientos o usa el avance automático.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.reply({ content: `✅ Finalizando emparejamiento manual con **${pairs.length}** partidos...` });

        // Llamar a startNextKnockoutRound con los pares manuales
        const { startNextKnockoutRoundManual } = await import('../logic/tournamentLogic.js');
        startNextKnockoutRoundManual(client, guild, tournament, pairs)
            .then(() => { if (interaction.channel) interaction.channel.send('🛠️ ¡La siguiente ronda con emparejamiento manual ha sido creada!'); })
            .catch(error => { console.error('Error en avance manual knockout:', error); if (interaction.channel) interaction.channel.send('❌ Error al crear la siguiente ronda manual. Revisa los logs.'); });
        return;
    }

    // =======================================================
    // --- CONSTRUCTOR DE JORNADAS MANUAL (LIGUILLA) ---
    // =======================================================

    if (action === 'admin_league_random') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        await interaction.editReply({ content: `✅ Orden recibida. El sorteo aleatorio para **${tournament.nombre}** ha comenzado en segundo plano.` });

        startGroupStage(client, guild, tournament)
            .then(() => { if (interaction.channel) { interaction.channel.send(`🎲 ¡El sorteo para **${tournament.nombre}** ha finalizado y la Jornada 1 ha sido creada!`); } })
            .catch(error => { console.error("Error durante el sorteo en segundo plano:", error); if (interaction.channel) { interaction.channel.send(`❌ Ocurrió un error crítico durante el sorteo. Revisa los logs.`); } });
        return;
    }

    if (action === 'admin_league_manual') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        const teams = Object.values(tournament.teams.aprobados).filter(t => t && t.id);
        const numTeams = teams.length;

        // Calcular total de jornadas
        let totalJornadas;
        if (tournament.config.leagueMode === 'round_robin_custom' && tournament.config.customRounds) {
            totalJornadas = parseInt(tournament.config.customRounds);
        } else if (tournament.config.leagueMode === 'custom_rounds') {
            totalJornadas = parseInt(tournament.config.customRounds) || 3;
        } else {
            // All vs all: N-1 jornadas (o (N-1)*2 para ida y vuelta)
            const base = numTeams % 2 === 0 ? numTeams - 1 : numTeams;
            totalJornadas = tournament.config.matchType === 'idavuelta' ? base * 2 : base;
        }

        // Inicializar el builder
        const jornadas = {};
        for (let i = 1; i <= totalJornadas; i++) {
            jornadas[i] = [];
        }

        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            {
                $set: {
                    'temp.leagueBuilder': {
                        currentJornada: 1,
                        totalJornadas,
                        pendingTeamA: null,
                        byeMode: false,
                        page: 0,
                        jornadas
                    }
                }
            }
        );

        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const message = buildLeagueConstructorMessage(updatedTournament);
        await interaction.editReply(message);
        return;
    }

    if (action === 'league_builder_undo') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament?.temp?.leagueBuilder) return;

        const builder = tournament.temp.leagueBuilder;
        const currentJornada = builder.currentJornada;

        // Si hay un pendingTeamA, cancelar esa selección
        if (builder.pendingTeamA || builder.byeMode) {
            await db.collection('tournaments').updateOne(
                { shortId: tournamentShortId },
                { $set: { 'temp.leagueBuilder.pendingTeamA': null, 'temp.leagueBuilder.byeMode': false } }
            );
        } else {
            // Si no, deshacer el último par de la jornada actual
            const jornada = builder.jornadas[currentJornada] || [];
            if (jornada.length > 0) {
                jornada.pop();
                await db.collection('tournaments').updateOne(
                    { shortId: tournamentShortId },
                    { $set: { [`temp.leagueBuilder.jornadas.${currentJornada}`]: jornada } }
                );
            }
        }

        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const message = buildLeagueConstructorMessage(updatedTournament);
        await interaction.editReply(message);
        return;
    }

    if (action === 'league_builder_bye') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;

        // Activar modo descanso: la siguiente selección del select menu será el equipo que descansa
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'temp.leagueBuilder.byeMode': true, 'temp.leagueBuilder.pendingTeamA': null } }
        );

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const message = buildLeagueConstructorMessage(tournament);
        await interaction.editReply(message);
        return;
    }

    if (action === 'league_builder_prev') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament?.temp?.leagueBuilder) return;

        const newJornada = Math.max(1, tournament.temp.leagueBuilder.currentJornada - 1);
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'temp.leagueBuilder.currentJornada': newJornada, 'temp.leagueBuilder.pendingTeamA': null, 'temp.leagueBuilder.byeMode': false, 'temp.leagueBuilder.page': 0 } }
        );

        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const message = buildLeagueConstructorMessage(updatedTournament);
        await interaction.editReply(message);
        return;
    }

    if (action === 'league_builder_next') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament?.temp?.leagueBuilder) return;

        const newJornada = Math.min(tournament.temp.leagueBuilder.totalJornadas, tournament.temp.leagueBuilder.currentJornada + 1);
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'temp.leagueBuilder.currentJornada': newJornada, 'temp.leagueBuilder.pendingTeamA': null, 'temp.leagueBuilder.byeMode': false, 'temp.leagueBuilder.page': 0 } }
        );

        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const message = buildLeagueConstructorMessage(updatedTournament);
        await interaction.editReply(message);
        return;
    }

    if (action === 'league_builder_page_prev' || action === 'league_builder_page_next') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament?.temp?.leagueBuilder) return;

        const currentPage = tournament.temp.leagueBuilder.page || 0;
        const newPage = action === 'league_builder_page_next' ? currentPage + 1 : Math.max(0, currentPage - 1);

        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'temp.leagueBuilder.page': newPage } }
        );

        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const message = buildLeagueConstructorMessage(updatedTournament);
        await interaction.editReply(message);
        return;
    }

    if (action === 'league_builder_confirm') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament?.temp?.leagueBuilder) return interaction.editReply({ content: 'Error: No hay constructor activo.' });

        const builder = tournament.temp.leagueBuilder;
        const allTeams = Object.values(tournament.teams.aprobados).filter(t => t && t.id);
        const expectedMatchesPerJornada = Math.floor(allTeams.length / 2);

        // Validar que haya al menos 1 jornada con partidos
        let totalMatches = 0;
        const emptyJornadas = [];
        for (let j = 1; j <= builder.totalJornadas; j++) {
            const jornadaPairs = builder.jornadas[j] || [];
            totalMatches += jornadaPairs.length;
            if (jornadaPairs.length === 0) emptyJornadas.push(j);
        }

        if (totalMatches === 0) {
            return interaction.editReply({ content: '❌ No hay ningún enfrentamiento creado. Construye al menos una jornada antes de confirmar.' });
        }

        if (emptyJornadas.length > 0) {
            return interaction.editReply({
                content: `⚠️ Las siguientes jornadas están vacías: **${emptyJornadas.join(', ')}**. ¿Seguro que quieres continuar?\nSi sí, pulsa de nuevo "✅ Confirmar Todo".`,
                components: buildLeagueConstructorMessage(tournament).components
            });
        }

        // Confirmar: aplicar el calendario manual
        await interaction.editReply({ content: `⏳ Aplicando calendario manual con **${totalMatches}** partidos en **${builder.totalJornadas}** jornadas...`, components: [] });

        try {
            await applyManualLeagueCalendar(client, guild, tournament);
            if (interaction.channel) {
                interaction.channel.send(`🎲 ¡El calendario manual para **${tournament.nombre}** ha sido aplicado y la Jornada 1 ha sido creada!`);
            }
        } catch (error) {
            console.error('Error aplicando calendario manual:', error);
            if (interaction.channel) {
                interaction.channel.send(`❌ Error al aplicar el calendario manual: ${error.message}`);
            }
        }
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

    if (action === 'admin_draft_ext_roulette') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: 'Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });

        const rouletteUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/?torneo=${tournament.shortId}`;

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🎲 Ruleta de Capitanes (Draft Externo)')
            .setDescription(`Haz clic en el botón de abajo para abrir la ruleta de este torneo.\n\n⚠️ **Importante:** Solo administradores pueden girar y confirmar capitanes.`)
            .setFooter({ text: 'El enlace es seguro y privado.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Abrir Ruleta en el Navegador')
                .setStyle(ButtonStyle.Link)
                .setURL(rouletteUrl)
        );

        return interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    }

    if (action === 'admin_draft_ext_pickorder') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: 'Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });

        const approvedCount = Object.keys(tournament.teams.aprobados || {}).length;
        if (approvedCount < 2) return interaction.reply({ content: '❌ Se necesitan al menos 2 capitanes aprobados para sortear el orden.', flags: [MessageFlags.Ephemeral] });

        const pickOrderUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/?pickorder=${tournament.shortId}`;

        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('🏆 Sorteo de Orden de Picks (Draft Externo)')
            .setDescription(`Haz clic en el botón de abajo para abrir la ruleta de orden de picks.\n\n📋 **Capitanes aprobados:** ${approvedCount}\n\n⚠️ **Nota:** Este sorteo es puramente visual. No modifica nada en el servidor ni en Discord.`)
            .setFooter({ text: 'El enlace es seguro y privado.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Abrir Ruleta de Orden de Picks')
                .setStyle(ButtonStyle.Link)
                .setURL(pickOrderUrl)
        );

        return interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    }

    if (action === 'admin_draft_ext_import_start') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: 'Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });

        await interaction.reply({
            content: `⏳ **Modo Importación Activado para: ${tournament.nombre}**\n\nPor favor, **escribe o pega aquí mismo** la lista completa, o **sube un archivo \`.txt\`** con los datos en los próximos **5 minutos**.\n*(Este método soporta listas ilimitadas, saltándose el límite de Discord).*`,
            flags: [MessageFlags.Ephemeral]
        });

        // Configurar colector de mensajes para el canal actual, solo del usuario que apretó el botón
        const filter = m => m.author.id === interaction.user.id;
        try {
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 300000, errors: ['time'] });
            const responseMsg = collected.first();
            let textData = '';

            // Si subió un archivo .txt, descargarlo
            if (responseMsg.attachments.size > 0) {
                const attachment = responseMsg.attachments.first();
                if (attachment.name.endsWith('.txt')) {
                    const fetch = (await import('node-fetch')).default;
                    const res = await fetch(attachment.url);
                    textData = await res.text();
                } else {
                    return interaction.followUp({ content: '❌ El archivo subido no es un `.txt` válido. Intenta de nuevo.', flags: [MessageFlags.Ephemeral] });
                }
            } else {
                // Si fue texto directo
                textData = responseMsg.content;
            }

            // Opcional: borrar el mensaje gigantesco de WhatsApp para mantener limpio el canal admin
            try { await responseMsg.delete(); } catch (e) { }

            const parsedPlayers = parseExternalDraftWhatsappList(textData);

            if (parsedPlayers.length === 0) {
                return interaction.followUp({ content: '❌ No se encontró ningún jugador válido en el texto. Verifica el formato.', flags: [MessageFlags.Ephemeral] });
            }

            // Agrupar jugadores por posición en columnas
            const posColumns = {
                'GK': { header: 'PORTEROS', color: 'FFFFFF00', players: [] },
                'DFC': { header: 'DEFENSAS', color: 'FF00CC00', players: [] },
                'CARR': { header: 'CARRILEROS', color: 'FF00BFFF', players: [] },
                'MC': { header: 'MEDIOS', color: 'FFFF8C00', players: [] },
                'DC': { header: 'DELANTEROS', color: 'FFFF3333', players: [] }
            };

            parsedPlayers.forEach(p => {
                const key = p.position || 'DC'; // si no tiene posición, va a delanteros
                if (posColumns[key]) {
                    posColumns[key].players.push(`${p.order}. ${p.name}`);
                } else {
                    posColumns['DC'].players.push(`${p.order}. ${p.name}`);
                }
            });

            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet(tournament.nombre || 'Capitanes');

            const columnKeys = ['GK', 'DFC', 'CARR', 'MC', 'DC'];

            // Cabeceras
            const headerRow = ws.getRow(1);
            columnKeys.forEach((key, colIdx) => {
                const cell = headerRow.getCell(colIdx + 1);
                cell.value = posColumns[key].header;
                cell.font = { bold: true, color: { argb: 'FF000000' }, size: 12 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: posColumns[key].color } };
                cell.alignment = { horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            // Calcular máximo de filas
            const maxRows = Math.max(...columnKeys.map(k => posColumns[k].players.length));

            for (let r = 0; r < maxRows; r++) {
                const row = ws.getRow(r + 2);
                columnKeys.forEach((key, colIdx) => {
                    const cell = row.getCell(colIdx + 1);
                    const playerList = posColumns[key].players;
                    if (r < playerList.length) {
                        cell.value = playerList[r];
                    } else {
                        cell.value = '';
                    }
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: posColumns[key].color } };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                });
            }

            // Ajuste de ancho de columnas
            ws.columns = columnKeys.map(() => ({ width: 28 }));

            // Generar buffer y adjunto
            const { AttachmentBuilder } = await import('discord.js');
            const excelBuffer = await workbook.xlsx.writeBuffer();
            const excelAttachment = new AttachmentBuilder(Buffer.from(excelBuffer), { name: `Capitanes_${tournamentShortId}.xlsx` });

            await interaction.channel.send({
                content: `📊 **Draft Externo:** Lista procesada para el torneo **${tournament.nombre}** (solicitada por <@${interaction.user.id}>).\nDescarga el archivo Excel con las posiciones organizadas por columnas de colores.`,
                files: [excelAttachment]
            });

            return interaction.followUp({ content: '✅ Lista procesada, archivo Excel e imagen enviados al canal correctamente.', flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            console.error('Error importando WhatsApp Collector:', error);
            if (error instanceof Map && error.size === 0) {
                return interaction.followUp({ content: '⏳ Tiempo agotado. No enviaste la lista en los 5 minutos dados. Vuelve a hacer clic en "Importar".', flags: [MessageFlags.Ephemeral] });
            } else {
                return interaction.followUp({ content: '❌ Ha ocurrido un error inesperado al procesar tu mensaje.', flags: [MessageFlags.Ephemeral] });
            }
        }
    }
    if (action === 'admin_end_tournament') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: No se pudo encontrar ese torneo.' });

        // --- ELIMINAR CANAL B (Aprobados) ---
        const aprobadosVoiceId = tournament.discordMessageIds?.capitanesAprobadosVoiceId;
        if (aprobadosVoiceId) {
            client.channels.fetch(aprobadosVoiceId).then(vc => {
                if (vc) vc.delete('Torneo finalizado - Canal de aprobados eliminado').catch(e => console.error('[VOZ] Error eliminando Canal B:', e));
            }).catch(() => { });
        }
        // --- FIN ELIMINAR CANAL B ---

        // --- ELIMINAR CANAL LISTA INSCRITOS ---
        if (tournament.registrationListData?.channelId) {
            await deleteRegistrationListChannel(client, tournament).catch(e => console.error('[REG LIST] Error eliminando canal lista:', e));
        }
        // --- FIN ELIMINAR CANAL LISTA INSCRITOS ---

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
        return;
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
        return;
    }

    if (action === 'admin_toggle_registration') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: "Error: Torneo no encontrado." });

        const isAdminOrRef = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.roles.cache.has(ARBITRO_ROLE_ID);
        if (!isAdminOrRef) {
            return interaction.editReply({ content: '❌ No tienes permisos para usar este botón.' });
        }

        const currentState = tournament.config.registrationClosed || false;
        const newState = !currentState;

        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            { $set: { 'config.registrationClosed': newState } }
        );

        // Update the admin panel to reflect the new state
        tournament.config.registrationClosed = newState;
        const { createTournamentManagementPanel } = await import('../utils/embeds.js');
        const { embeds, components } = createTournamentManagementPanel(tournament);
        await interaction.message.edit({ embeds, components });

        await interaction.editReply({ content: `✅ Inscripciones **${newState ? 'CERRADAS' : 'ABIERTAS'}** para el torneo.` });
        return;
    }

    if (action === 'admin_set_promo_image') {
        const [tournamentShortId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`promo_image_modal:${tournamentShortId}`)
            .setTitle('Imagen Promocional');

        const imageUrlInput = new TextInputBuilder()
            .setCustomId('promo_image_url')
            .setLabel('URL de la Imagen (vacío para borrar)')
            .setPlaceholder('https://imgur.com/...png')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(imageUrlInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_set_rules_link') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: "Error: Torneo no encontrado.", flags: [MessageFlags.Ephemeral] });

        const modal = new ModalBuilder()
            .setCustomId(`rules_link_modal:${tournamentShortId}`)
            .setTitle('Link de Normativas (Opcional)');

        const rulesUrlInput = new TextInputBuilder()
            .setCustomId('rules_url')
            .setLabel('URL de Normas (vacío usa el genérico)')
            .setPlaceholder('https://...')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);
            
        if (tournament.config.customRulesUrl) {
            rulesUrlInput.setValue(tournament.config.customRulesUrl);
        }

        modal.addComponents(new ActionRowBuilder().addComponents(rulesUrlInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_toggle_elo') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: "Error: Torneo no encontrado." });

        const isAdminOrRef = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.roles.cache.has(ARBITRO_ROLE_ID);
        if (!isAdminOrRef) return interaction.editReply({ content: '❌ No tienes permisos.' });

        const currentRequireElo = tournament.config.requireElo !== false; // por defecto es true
        const newRequireElo = !currentRequireElo;

        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            { $set: { 'config.requireElo': newRequireElo } }
        );

        tournament.config.requireElo = newRequireElo;
        const { createTournamentManagementPanel } = await import('../utils/embeds.js');
        const { embeds, components } = createTournamentManagementPanel(tournament);
        await interaction.message.edit({ embeds, components });

        await interaction.editReply({ content: `✅ Validación de ELO **${newRequireElo ? 'ACTIVADA' : 'DESACTIVADA'}** para este torneo.` });
        return;
    }

    if (action === 'admin_edit_league_restrictions') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: "Error: Torneo no encontrado.", flags: [MessageFlags.Ephemeral] });

        const isAdminOrRef = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.roles.cache.has(ARBITRO_ROLE_ID);
        if (!isAdminOrRef) {
            return interaction.reply({ content: '❌ No tienes permisos para usar este botón.', flags: [MessageFlags.Ephemeral] });
        }

        const currentLeagues = tournament.config.allowedLeagues || [];
        
        // Build the selector options
        const options = [
            { label: 'Todas las ligas', description: 'Sin restricción de ELO', value: 'ALL', emoji: '🌐', default: currentLeagues.length === 0 },
            { label: 'Liga DIAMOND (1550+ ELO)', value: 'DIAMOND', emoji: '💎', default: currentLeagues.includes('DIAMOND') },
            { label: 'Liga GOLD (1300-1549 ELO)', value: 'GOLD', emoji: '👑', default: currentLeagues.includes('GOLD') },
            { label: 'Liga SILVER (1000-1299 ELO)', value: 'SILVER', emoji: '⚙️', default: currentLeagues.includes('SILVER') },
            { label: 'Liga BRONZE (<1000 ELO)', value: 'BRONZE', emoji: '🥉', default: currentLeagues.includes('BRONZE') }
        ];

        const leagueMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_save_league_restrictions:${tournamentShortId}`)
            .setPlaceholder('Selecciona las ligas permitidas')
            .setMinValues(1)
            .setMaxValues(4)
            .addOptions(options);

        await interaction.reply({
            content: `**⚙️ Editar Restricciones de Liga** para \`${tournament.nombre}\`:\nSelecciona qué ligas pueden participar en este torneo.`,
            components: [new ActionRowBuilder().addComponents(leagueMenu)],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    if (action === 'admin_distribute_whatsapp_start') {
        const isAdminOrRef = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.roles.cache.has(ARBITRO_ROLE_ID);
        if (!isAdminOrRef) {
            return interaction.reply({ content: '❌ No tienes permisos para usar este botón.', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId('admin_distribute_whatsapp_modal')
            .setTitle('Distribución desde WhatsApp');

        const maxTeamsInput = new TextInputBuilder()
            .setCustomId('max_teams_per_tournament')
            .setLabel("Máximo de equipos por torneo")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ej: 10")
            .setRequired(true);

        const waListInput = new TextInputBuilder()
            .setCustomId('whatsapp_list_input')
            .setLabel("Lista de Equipos (WhatsApp)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Pega aquí la lista de WhatsApp. Ej:\n1. Equipo A - @user1...")
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(maxTeamsInput),
            new ActionRowBuilder().addComponents(waListInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_confirm_whatsapp_distribution') {
        const [tempId] = params;
        const tempDistribution = await db.collection('tempData').findOne({ _id: new ObjectId(tempId) });
        if (!tempDistribution) {
            return interaction.reply({ content: '❌ Los datos de esta distribución ya no existen o han caducado.', flags: [MessageFlags.Ephemeral] });
        }

        const isAdminOrRef = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.roles.cache.has(ARBITRO_ROLE_ID);
        if (!isAdminOrRef) {
            return interaction.reply({ content: '❌ No tienes permisos para usar esto.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply();

        let totalInscribed = 0;
        let errors = 0;
        const { approveTeam, updatePublicMessages } = await import('../logic/tournamentLogic.js');

        for (const assignment of tempDistribution.assignments) {
            const tournamentShortId = assignment.tournamentId;
            let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) continue;
            
            for (const team of assignment.teams) {
                const captainId = team.managerId;
                
                // Construir "teamData"
                const teamData = {
                    id: captainId,
                    nombre: team.name,
                    eafcTeamName: "",
                    capitanId: captainId,
                    capitanTag: "WhatsApp_Inscripcion",
                    coCaptainId: null,
                    coCaptainTag: null,
                    bandera: '🏳️',
                    paypal: null,
                    streamChannel: null,
                    twitter: null,
                    inscritoEn: new Date(),
                    extraCaptains: team.extraCaptains || []
                };

                // Meter en pendientes y aprobar
                await db.collection('tournaments').updateOne(
                    { _id: tournament._id },
                    { $set: { [`teams.pendientes.${captainId}`]: teamData } }
                );

                // Recargar el torneo actualizado para approveTeam
                tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
                
                try {
                    await approveTeam(interaction.client, tournament, teamData);
                    totalInscribed++;
                } catch (e) {
                    console.error('Error aprobando equipo:', e);
                    errors++;
                }
            }
            
            // Actualizar public messages una vez por torneo
            tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            await updatePublicMessages(interaction.client, tournament);
        }

        // Limpiar
        await db.collection('tempData').deleteOne({ _id: new ObjectId(tempId) });

        await interaction.editReply({ content: `✅ **Inscripción Masiva Completada**.\nSe inscribieron **${totalInscribed}** equipos correctamente. Errores: **${errors}**.` });
        return;
    }

    if (action === 'admin_kick_captain') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [captainId, tournamentShortId] = params;

        const isAdminOrRef = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.roles.cache.has(ARBITRO_ROLE_ID);
        if (!isAdminOrRef) {
            return interaction.editReply({ content: '❌ No tienes permisos para usar este botón.' });
        }

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: "Error: Torneo no encontrado." });

        const teamData = tournament.teams?.aprobados?.[captainId];
        if (!teamData) {
            return interaction.editReply({ content: "Error: El capitán no está en la lista de aprobados." });
        }

        // Si vino de una bolsa, preguntar qué hacer
        if (teamData.capitanTag === 'Bolsa_Inscripcion') {
            const originPool = await db.collection('team_pools').findOne({
                [`usedInTournaments.${tournamentShortId}`]: captainId
            });

            if (originPool) {
                const choiceRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`admin_kick_return_pool:${captainId}:${tournamentShortId}:${originPool.shortId}`)
                        .setLabel('🔄 Devolver a la Bolsa')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`admin_kick_permanent:${captainId}:${tournamentShortId}`)
                        .setLabel('🗑️ Expulsar Definitivamente')
                        .setStyle(ButtonStyle.Danger)
                );

                await interaction.editReply({
                    content: `⚠️ **${teamData.nombre}** vino de la bolsa **${originPool.name}**.\n¿Quieres devolverlo a la bolsa o expulsarlo definitivamente?`,
                    components: [choiceRow]
                });
                return;
            }
        }

        // Si no vino de bolsa, expulsar directamente
        const { kickTeam } = await import('../logic/tournamentLogic.js');
        await kickTeam(client, tournament, captainId);

        const updatedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('disabled_kicked_btn')
                .setLabel('Expulsado')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
        await interaction.message.edit({ components: [updatedRow] });
        await interaction.editReply({ content: `✅ **${teamData.nombre}** ha sido expulsado del torneo.` });
        return;
    }

    // --- KICK + DEVOLVER A BOLSA ---
    if (action === 'admin_kick_return_pool') {
        await interaction.deferUpdate();
        const [captainId, tournamentShortId, poolShortId] = params;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: '❌ Torneo no encontrado.', components: [] });

        const teamData = tournament.teams?.aprobados?.[captainId];
        if (!teamData) return interaction.editReply({ content: '❌ Equipo ya no está en el torneo.', components: [] });

        const { kickTeam } = await import('../logic/tournamentLogic.js');
        await kickTeam(client, tournament, captainId);

        // Devolver a la bolsa
        let returnedOk = false;
        try {
            const testDb = getDb('test');
            const { getLeagueByElo } = await import('../logic/eloLogic.js');
            const teamRecord = await testDb.collection('teams').findOne({ guildId: interaction.guildId, managerId: captainId });

            if (teamRecord) {
                const teamElo = teamRecord.elo || 1000;
                const teamEntry = {
                    teamDbId: teamRecord._id.toString(),
                    teamName: teamRecord.name,
                    managerId: captainId,
                    captains: teamRecord.captains || [],
                    elo: teamElo,
                    league: getLeagueByElo(teamElo),
                    logoUrl: teamRecord.logoUrl || null,
                    inscritoEn: new Date(),
                    inscritoPor: 'system_return',
                    inscritoVia: 'devuelto_torneo'
                };

                await db.collection('team_pools').updateOne(
                    { shortId: poolShortId },
                    {
                        $set: { [`teams.${captainId}`]: teamEntry },
                        $pull: { [`usedInTournaments.${tournamentShortId}`]: captainId }
                    }
                );

                const { createPoolEmbed } = await import('../utils/embeds.js');
                const updatedPool = await db.collection('team_pools').findOne({ shortId: poolShortId });
                const ch = await client.channels.fetch(updatedPool.discordChannelId).catch(() => null);
                if (ch) {
                    const msg = await ch.messages.fetch(updatedPool.discordMessageId).catch(() => null);
                    if (msg) await msg.edit(createPoolEmbed(updatedPool));
                }
                if (updatedPool.logThreadId) {
                    const thread = await client.channels.fetch(updatedPool.logThreadId).catch(() => null);
                    if (thread) await thread.send(`🔄 **${teamRecord.name}** devuelto a la bolsa tras ser expulsado del torneo **${tournament.nombre}** por <@${interaction.user.id}>.`);
                }
                returnedOk = true;
            }
        } catch (e) { console.error('[Pool Return] Error:', e.message); }

        await interaction.editReply({
            content: returnedOk
                ? `✅ **${teamData.nombre}** expulsado del torneo y **devuelto a la bolsa**.`
                : `✅ **${teamData.nombre}** expulsado, pero hubo un error al devolverlo a la bolsa.`,
            components: []
        });
        return;
    }

    // --- KICK DEFINITIVO (sin devolver a bolsa) ---
    if (action === 'admin_kick_permanent') {
        await interaction.deferUpdate();
        const [captainId, tournamentShortId] = params;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: '❌ Torneo no encontrado.', components: [] });

        const teamData = tournament.teams?.aprobados?.[captainId];
        if (!teamData) return interaction.editReply({ content: '❌ Equipo ya no está en el torneo.', components: [] });

        const { kickTeam } = await import('../logic/tournamentLogic.js');
        await kickTeam(client, tournament, captainId);

        await interaction.editReply({
            content: `✅ **${teamData.nombre}** ha sido expulsado **definitivamente** del torneo (no vuelve a la bolsa).`,
            components: []
        });
        return;
    }

    if (action === 'darse_baja_start') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: "Error: Torneo no encontrado.", flags: [MessageFlags.Ephemeral] });

        // --- NUEVA LÓGICA: COMPROBAR SI ES JUGADOR DRAFT EXTERNO ---
        if (tournament.config && tournament.config.isPaid && tournament.config.paidSubType === 'draft') {
            const playerReg = await db.collection('external_draft_registrations').findOne({
                tournamentId: tournamentShortId,
                $or: [{ userId: interaction.user.id }, { discordId: interaction.user.id }]
            });

            if (playerReg) {
                // Eliminar jugador de external_draft_registrations
                await db.collection('external_draft_registrations').deleteOne({
                    _id: playerReg._id
                });

                if (tournament.registrationLogThreadId) {
                    const logChannel = await client.channels.fetch(tournament.registrationLogThreadId).catch(() => null);
                    if (logChannel) {
                        await logChannel.send(`❌ **BAJA JUGADOR (Discord Botón Rojo):** <@${interaction.user.id}> (${playerReg.gameId}) se ha dado de baja. Liberada plaza de **${playerReg.position}**.`);
                    }
                }

                // Hook: actualizar canal de lista de inscritos
                scheduleRegistrationListUpdate(client, tournamentShortId);

                return interaction.reply({ content: `✅ **Baja completada.** Te has dado de baja de este Draft correctamente. Ya no ocupas plaza.`, flags: [MessageFlags.Ephemeral] });
            }
        }
        // --- FIN LÓGICA JUGADOR ---

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const result = await requestUnregister(client, tournament, interaction.user.id);
        await interaction.editReply({ content: result.message });
        return;
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
        return;
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

    // [DUPLICADO ELIMINADO] admin_prize_paid — la versión correcta con deferUpdate y labels 'PAGADO' está más abajo

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
        return;
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
        return;
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

        const PAGE_SIZE = 25;

        if (approvedTeams.length > PAGE_SIZE) {
            const pageCount = Math.ceil(approvedTeams.length / PAGE_SIZE);
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                const start = i * PAGE_SIZE + 1;
                const end = Math.min((i + 1) * PAGE_SIZE, approvedTeams.length);
                pageOptions.push({
                    label: `Página ${i + 1} (Equipos ${start}-${end})`,
                    value: `page_${i}`,
                });
            }

            const pageMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_assign_cocaptain_page_select:${tournamentShortId}`)
                .setPlaceholder('Selecciona la página de equipos')
                .addOptions(pageOptions);

            await interaction.editReply({
                content: `Hay ${approvedTeams.length} equipos. Selecciona una página para ver los equipos y asignar co-capitanes:`,
                components: [new ActionRowBuilder().addComponents(pageMenu)]
            });
            return;
        }

        const teamOptions = approvedTeams.map(team => ({
            label: team.nombre,
            description: `Capitán: ${team.capitanTag}${team.coCaptainTag ? ` | Co-cap actual: ${team.coCaptainTag.split('#')[0]}` : ''}`,
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
            flags: [MessageFlags.Ephemeral]
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

    if (action === 'subreq_app' || action === 'subreq_rej') {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isReferee = interaction.member.roles.cache.has(ARBITRO_ROLE_ID);

        if (!isAdmin && !isReferee) {
            return interaction.reply({ content: '❌ Solo los administradores o árbitros pueden decidir.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferUpdate();
        const wasApproved = action === 'subreq_app';
        const [draftShortId, captainId, outPlayerId, inPlayerId] = params;

        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        const db = getDb();
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        if (wasApproved) {
            if (!draft) return interaction.followUp({ content: '❌ Draft no encontrado.', flags: [MessageFlags.Ephemeral] });

            try {
                const { acceptReplacement } = await import('../logic/tournamentLogic.js');
                await acceptReplacement(client, interaction.guild, draft, captainId, outPlayerId, inPlayerId);

                originalEmbed.setColor('#2ecc71').setFooter({ text: `Sustitución aprobada por ${interaction.user.tag}` });
                await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });

                const captainUser = await client.users.fetch(captainId).catch(() => null);
                if (captainUser) await captainUser.send('✅ Un administrador ha **aprobado** tu solicitud de sustitución en el draft.');

                const inUser = await client.users.fetch(inPlayerId).catch(() => null);
                if (inUser) await inUser.send(`🎉 Has sido seleccionado como **Agente Libre** para sustituir a un jugador en el equipo del draft **${draft.name}**. ¡Ya tienes acceso a los canales del equipo!`);

            } catch (error) {
                console.error('Error al aprobar sustitución:', error);
                await interaction.followUp({ content: '❌ Error: ' + error.message, flags: [MessageFlags.Ephemeral] });
            }
        } else {
            originalEmbed.setColor('#e74c3c').setFooter({ text: `Sustitución denegada por ${interaction.user.tag}` });
            await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });

            const captainUser = await client.users.fetch(captainId).catch(() => null);
            if (captainUser) await captainUser.send(`❌ Un administrador ha **denegado** tu solicitud de sustituir a un jugador por un agente libre en el draft ${draft?.name || ''}.`);
        }
        return;
    }

    if (action === 'consult_player_data_start') {
        const [draftShortId] = params;
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) return interaction.reply({ content: '❌ Draft no encontrado.', flags: [MessageFlags.Ephemeral] });
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
        if (!ticket) return interaction.reply({ content: '❌ Ticket de verificación no encontrado.', flags: [MessageFlags.Ephemeral] });

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
        return;
    }

    if (action === 'user_exit_without_registering') {
        const [channelId] = params;
        const ticket = await db.collection('verificationtickets').findOne({ channelId });
        if (!ticket) return interaction.reply({ content: '❌ Ticket de verificación no encontrado.', flags: [MessageFlags.Ephemeral] });

        if (interaction.user.id !== ticket.userId) {
            return interaction.reply({ content: '❌ Este botón no es para ti.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            // Intenta responder. Si ya se respondió, el catch lo manejará.
            await interaction.reply({
                content: `De acuerdo, te sales sin inscribirte. Recuerda que siempre podrás hacerlo más tarde desde el canal <#${CHANNELS.TOURNAMENTS_STATUS}>.`,
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
        return;
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
        return;
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
    // [DUPLICADO ELIMINADO] admin_kick_team_start — la versión correcta con interaction.reply está más arriba
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

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_reopen_match_start:${tournamentShortId}`)
                .setLabel('Solucionar Hilos')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏪'),
            new ButtonBuilder()
                .setCustomId(`admin_open_pending_jornada_start:${tournamentShortId}`)
                .setLabel('Abrir Hilos')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🧹'),
            new ButtonBuilder()
                .setCustomId(`admin_frenar_jornada_start:${tournamentShortId}`)
                .setLabel('Frenar Jornada')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🛑')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_modify_final_result_start:${tournamentShortId}`)
                .setLabel('Modificar Resultado')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('✍️'),
            new ButtonBuilder()
                .setCustomId(`admin_recalc_playoffs_warn:${tournamentShortId}`)
                .setLabel('Recalcular Eliminatoria')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId(`admin_return_to_main_panel:${tournamentShortId}`)
                .setLabel('<< Volver')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row1, row2] });
        return;
    }

    if (action === 'admin_frenar_jornada_start') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament || !tournament.structure) {
            return interaction.editReply({ content: '❌ No se encontró la estructura del torneo.', embeds: [], components: [] });
        }

        // Recopilar partidos del calendario
        const calendarMatches = tournament.structure.calendario ? Object.values(tournament.structure.calendario).flat() : [];
        
        // Recopilar partidos de eliminatorias (taggeados con _elimStage)
        const elimMatchesTagged = [];
        if (tournament.structure.eliminatorias) {
            for (const stageKey of Object.keys(tournament.structure.eliminatorias)) {
                if (stageKey === 'rondaActual') continue;
                const stageData = tournament.structure.eliminatorias[stageKey];
                const matchesArray = Array.isArray(stageData) ? stageData : (stageData ? [stageData] : []);
                for (const m of matchesArray) {
                    if (m) elimMatchesTagged.push({ ...m, _elimStage: stageKey });
                }
            }
        }

        const allMatches = [...calendarMatches, ...elimMatchesTagged];
        
        // Filtrar partidos que Tienen Hilo para ser frenados (ni ghost, ni finalizados)
        const stoppableMatches = allMatches.filter(m => 
            m.threadId && 
            m.status !== 'finalizado' && 
            m.equipoA?.id !== 'ghost' && 
            m.equipoB?.id !== 'ghost'
        );

        if (stoppableMatches.length === 0) {
            return interaction.followUp({ content: '✅ No se encontraron hilos creados activos en ninguna jornada/eliminatoria para frenar.', ephemeral: true });
        }

        // Agrupar por jornada (calendario) y por stage (eliminatorias)
        const stoppableByJornada = {};
        const stoppableByElimStage = {};
        for (const m of stoppableMatches) {
            if (m._elimStage) {
                if (!stoppableByElimStage[m._elimStage]) stoppableByElimStage[m._elimStage] = 0;
                stoppableByElimStage[m._elimStage]++;
            } else {
                if (!stoppableByJornada[m.jornada]) stoppableByJornada[m.jornada] = 0;
                stoppableByJornada[m.jornada]++;
            }
        }

        const STAGE_LABELS_F = { 'octavos': 'Octavos de Final', 'cuartos': 'Cuartos de Final', 'semis': 'Semifinales', 'final': 'Final', 'tercerPuesto': 'Tercer Puesto' };
        const options = Object.keys(stoppableByJornada).map(jornadaNum => ({
            label: `Jornada ${jornadaNum}`,
            description: `Contiene ${stoppableByJornada[jornadaNum]} hilos activos por frenar.`,
            value: jornadaNum.toString()
        }));

        // Añadir opciones de eliminatorias
        for (const stageKey of Object.keys(stoppableByElimStage)) {
            options.push({
                label: `🏆 ${STAGE_LABELS_F[stageKey] || stageKey}`,
                description: `Eliminatoria: ${stoppableByElimStage[stageKey]} hilos activos.`,
                value: `elim_${stageKey}`
            });
        }

        // Evitamos sobrepasar el límite de 25 de Discord y agregamos la opción "Todas"
        const safeOptions = options.slice(0, 24);
        if (options.length > 1) {
            safeOptions.unshift({
                label: `✨ TODAS (Liga + Eliminatorias)`,
                description: `Peligro: Frena TODO. Puede tardar MUCHÍSIMO tiempo.`,
                value: 'all'
            });
        }

        const selectMenuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`admin_frenar_jornada_select:${tournamentShortId}`)
                .setPlaceholder('Selecciona la Jornada que quieres Frenar/Pausar')
                .addOptions(safeOptions)
        );

        const backRow = new ActionRowBuilder().addComponents(
             new ButtonBuilder()
                .setCustomId(`admin_manage_results_start:${tournamentShortId}`)
                .setLabel('<< Volver')
                .setStyle(ButtonStyle.Secondary)
        );

        const embedDisplay = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle(`🛑 Herramienta: Freno de Jornadas`)
            .setDescription('Selecciona una jornada del menú desplegable. El bot buscará **únicamente** los partidos de esa jornada que ya tienen un hilo creado y que aún **no han finalizado**. Borrará sus hilos de Discord con una pausa de seguridad, y los devolverá al estado `pendiente` a la espera de que decidas volver a abrir la jornada.');

        return interaction.editReply({ embeds: [embedDisplay], components: [selectMenuRow, backRow] });
    }

    if (action === 'admin_open_pending_jornada_start') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament || !tournament.structure) {
            return interaction.editReply({ content: '❌ No se encontró la estructura del torneo.', embeds: [], components: [] });
        }

        // Recopilar partidos del calendario
        const calendarMatches = tournament.structure.calendario ? Object.values(tournament.structure.calendario).flat() : [];
        
        // Recopilar partidos de eliminatorias
        const elimMatchesTagged = [];
        if (tournament.structure.eliminatorias) {
            for (const stageKey of Object.keys(tournament.structure.eliminatorias)) {
                if (stageKey === 'rondaActual') continue;
                const stageData = tournament.structure.eliminatorias[stageKey];
                const matchesArray = Array.isArray(stageData) ? stageData : (stageData ? [stageData] : []);
                for (const m of matchesArray) {
                    if (m && m.equipoA?.id && m.equipoB?.id) elimMatchesTagged.push({ ...m, _elimStage: stageKey });
                }
            }
        }

        const allMatches = [...calendarMatches, ...elimMatchesTagged];
        
        // Filtrar partidos que están 'pendiente' y NO son contra ghost
        const pendingMatches = allMatches.filter(m => 
            m.status === 'pendiente' && 
            m.equipoA?.id && m.equipoA.id !== 'ghost' && 
            m.equipoB?.id && m.equipoB.id !== 'ghost'
        );

        if (pendingMatches.length === 0) {
            return interaction.followUp({ content: '✅ No se encontraron hilos pendientes en ninguna jornada/eliminatoria válida.', ephemeral: true });
        }

        // Agrupar por jornada (calendario) y por stage (eliminatorias)
        const pendingByJornada = {};
        const pendingByElimStage = {};
        for (const m of pendingMatches) {
            if (m._elimStage) {
                if (!pendingByElimStage[m._elimStage]) pendingByElimStage[m._elimStage] = 0;
                pendingByElimStage[m._elimStage]++;
            } else {
                if (!pendingByJornada[m.jornada]) pendingByJornada[m.jornada] = 0;
                pendingByJornada[m.jornada]++;
            }
        }

        const STAGE_LABELS_O = { 'octavos': 'Octavos de Final', 'cuartos': 'Cuartos de Final', 'semis': 'Semifinales', 'final': 'Final', 'tercerPuesto': 'Tercer Puesto' };
        const options = Object.keys(pendingByJornada).map(jornadaNum => ({
            label: `Jornada ${jornadaNum}`,
            description: `Contiene ${pendingByJornada[jornadaNum]} hilos pendientes por abrir.`,
            value: jornadaNum.toString()
        }));

        // Añadir opciones de eliminatorias
        for (const stageKey of Object.keys(pendingByElimStage)) {
            options.push({
                label: `🏆 ${STAGE_LABELS_O[stageKey] || stageKey}`,
                description: `Eliminatoria: ${pendingByElimStage[stageKey]} hilos pendientes.`,
                value: `elim_${stageKey}`
            });
        }

        // Evitamos sobrepasar el límite de 25 de Discord y agregamos la opción "Todas"
        const safeOptions = options.slice(0, 24);
        if (options.length > 1) {
            safeOptions.unshift({
                label: `✨ TODAS (Liga + Eliminatorias)`,
                description: `Abre TODO. Puede tardar MUCHÍSIMO tiempo.`,
                value: 'all'
            });
        }

        const selectMenuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`admin_open_pending_jornada_select:${tournamentShortId}`)
                .setPlaceholder('Selecciona la Jornada que quieres abrir')
                .addOptions(safeOptions)
        );

        const backRow = new ActionRowBuilder().addComponents(
             new ButtonBuilder()
                .setCustomId(`admin_manage_results_start:${tournamentShortId}`)
                .setLabel('<< Volver')
                .setStyle(ButtonStyle.Secondary)
        );

        const embedDisplay = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`🧹 Herramienta: Escoba de Jornadas`)
            .setDescription('Selecciona una jornada del menú desplegable. El bot buscará **únicamente** los partidos en estado `pendiente` de esa jornada específica y los abrirá de golpe con una pequeña pausa de seguridad de 2 segundos entre cada hilo para no saturar a Discord. Dejará intactos a todos los demás.');

        return interaction.editReply({ embeds: [embedDisplay], components: [selectMenuRow, backRow] });
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

    if (action === 'admin_recalc_playoffs_warn') {
        const [tournamentShortId] = params;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_recalc_playoffs_exec:${tournamentShortId}`).setLabel('SÍ, RECALCULAR Y BORRAR').setStyle(ButtonStyle.Danger).setEmoji('💥'),
            new ButtonBuilder().setCustomId(`admin_manage_results_start:${tournamentShortId}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({
            content: '⚠️ **ADVERTENCIA DE SEGURIDAD** ⚠️\n\nSi continúas, el bot:\n1. Eliminará silenciosamente en Discord todos los hilos generados para la fase final actual.\n2. Borrará los datos de eliminatorias de la base de datos.\n3. Recalculará el Top según la tabla actualizada y generará los cruces de nuevo.\n\n**¿Estás completamente seguro?**',
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    if (action === 'admin_recalc_playoffs_exec') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return;

        let deletedCount = 0;
        const eliminatoriasData = tournament.structure?.eliminatorias;

        // 1. Limpieza de Hilos en Discord
        if (eliminatoriasData) {
            for (const stageKey of Object.keys(eliminatoriasData)) {
                if (stageKey === 'rondaActual') continue;
                const stageMatches = eliminatoriasData[stageKey];
                const matchesArray = Array.isArray(stageMatches) ? stageMatches : (stageMatches ? [stageMatches] : []);
                
                for (const match of matchesArray) {
                    if (match && match.threadId) {
                        try {
                            const thread = await client.channels.fetch(match.threadId);
                            if (thread) {
                                await thread.delete('Recálculo de eliminatorias por Admin');
                                deletedCount++;
                            }
                        } catch (e) {
                            if (e.code !== 10003) console.log(`No se pudo borrar el hilo ${match.threadId}: ${e.message}`);
                        }
                    }
                }
            }
        }

        // 2. Limpieza en BD y reset a estado de grupos
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { 
                $unset: { "structure.eliminatorias": "" },
                $set: { status: "fase_de_grupos" } 
            }
        );

        // 3. Disparar autogeneración basada en tabla actual
        const guild = await client.guilds.fetch(tournament.guildId);
        const { checkForGroupStageAdvancement } = await import('../logic/tournamentLogic.js');
        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        await checkForGroupStageAdvancement(client, guild, updatedTournament);

        await interaction.editReply({
            content: `✅ **Eliminatorias Recalculadas con Éxito**\nSe borraron ${deletedCount} hilos eliminatorios antiguos. El sistema de generación ha evaluado la tabla actual y creado la nueva fase final validada.`,
            components: []
        });
        return;
    }
    // Muestra la lista de partidos para reabrir o modificar
    if (action === 'admin_reopen_match_start' || action === 'admin_modify_final_result_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        const approvedTeams = Object.values(tournament.teams.aprobados);

        if (approvedTeams.length === 0) {
            return interaction.editReply({ content: 'No hay equipos aprobados en este torneo.' });
        }

        approvedTeams.sort((a, b) => a.nombre.localeCompare(b.nombre));

        const pageSize = 25;
        const pageCount = Math.ceil(approvedTeams.length / pageSize);
        const page = 0;

        const startIndex = page * pageSize;
        const teamsOnPage = approvedTeams.slice(startIndex, startIndex + pageSize);

        const teamOptions = teamsOnPage.map(team => ({
            label: team.nombre,
            description: `Capitán: ${team.capitanTag}`,
            value: team.id
        }));

        const isModify = action === 'admin_modify_final_result_start';
        const baseAction = isModify ? 'admin_modify' : 'admin_reopen';

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${baseAction}_select_team:${tournamentShortId}`)
            .setPlaceholder(`Paso 1: Selecciona equipo (Pág. 1)`)
            .addOptions(teamOptions);

        const components = [new ActionRowBuilder().addComponents(selectMenu)];

        if (pageCount > 1) {
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                const startNum = i * pageSize + 1;
                const endNum = Math.min((i + 1) * pageSize, approvedTeams.length);
                pageOptions.push({
                    label: `Página ${i + 1} (${startNum}-${endNum})`,
                    value: `page_${i}`
                });
            }
            const pageSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`${baseAction}_select_team_page:${tournamentShortId}`)
                .setPlaceholder('Paso 1.5: Cambiar de página (Equipos)')
                .addOptions(pageOptions);

            components.push(new ActionRowBuilder().addComponents(pageSelectMenu));
        }

        await interaction.editReply({
            content: `Selecciona el equipo cuyo partido quieres ${isModify ? 'modificar' : 'reabrir'} (Mostrando ${teamsOnPage.length} de ${approvedTeams.length}):`,
            components: components
        });
        return;
    }

    // [DUPLICADO ELIMINADO] payment_confirm_start — este handler hacía deferReply antes de showModal (imposible en Discord.js). La versión correcta está en el bloque modalActions

    if (action === 'payment_confirm_submit') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const ref = interaction.fields.getTextInputValue('payment_ref_input');
        const userId = interaction.user.id;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const pendingData = tournament.teams.pendingPayments?.[userId];
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

        // Buscar en pendientes (donde guarda la web/modal actual)
        const pendingData = tournament.teams.pendientes?.[captainId] || tournament.teams.pendingPayments?.[captainId] || tournament.teams.pendingApproval?.[captainId];

        if (!pendingData) {
            console.log(`[DEBUG] Solicitud no encontrada para ${captainId} en torneo ${tournamentShortId}`);
            return interaction.editReply('❌ Solicitud no encontrada o ya procesada');
        }

        // 1. Construir objeto de equipo final directamente (Aprobamos instantáneamente)
        const teamData = {
            id: captainId, // En torneos de pago, el ID del equipo es el ID del usuario
            nombre: pendingData.teamName || pendingData.nombre || 'Desconocido',
            eafcTeamName: pendingData.eafcTeamName || pendingData.teamName || pendingData.nombre || 'Desconocido',
            capitanId: captainId,
            capitanTag: pendingData.userTag || pendingData.capitanTag || 'Desconocido',
            coCaptainId: null,
            coCaptainTag: null,
            logoUrl: pendingData.logoUrl || null,
            twitter: pendingData.twitter || 'N/A',
            streamChannel: pendingData.streamChannel || null,
            whatsapp: pendingData.whatsapp || '',
            adminMessageId: pendingData.adminMessageId || null,
            paypal: null,
            inscritoEn: new Date(),
            isPaid: false // Queda pendiente de pago real
        };

        if (teamData.nombre === 'Desconocido' && teamData.capitanTag) {
            teamData.nombre = `Equipo de ${teamData.capitanTag}`;
            teamData.eafcTeamName = teamData.nombre;
        }

        // 2. Aprobar al equipo oficialmente en el torneo
        await approveTeam(client, tournament, teamData);

        // --- DAR PERMISO VOZ CANAL B (Aprobados) - background ---
        if (tournament.config?.isPaid && tournament.discordMessageIds?.capitanesAprobadosVoiceId) {
            client.channels.fetch(tournament.discordMessageIds.capitanesAprobadosVoiceId).then(vc => {
                if (vc) vc.permissionOverwrites.create(captainId, { ViewChannel: true, Connect: true, Speak: true }).catch(e => console.error('[VOZ] Error Canal B payment_info:', e));
            }).catch(() => { });
        }

        // Limpiamos los arrays pendientes
        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            {
                $unset: {
                    [`teams.pendientes.${captainId}`]: "",
                    [`teams.pendingPayments.${captainId}`]: "",
                    [`teams.pendingApproval.${captainId}`]: ""
                }
            }
        );

        // 3. Construir info de pago
        let paymentInstructions = '';
        if (tournament.config.paypalEmail) {
            paymentInstructions += `\n- **PayPal:** \`${tournament.config.paypalEmail}\``;
        }
        if (tournament.config.bizumNumber) {
            paymentInstructions += `\n- **Bizum:** \`${tournament.config.bizumNumber}\``;
        }
        if (!paymentInstructions) {
            paymentInstructions = "\n*No hay métodos configurados. Contacta con un administrador para realizar el pago.*";
        }

        // 4. Enviar DM al usuario con info de pago (sin botón)
        try {
            const user = await client.users.fetch(captainId);
            const paymentEmbed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle(`✅ Aprobado Oficialmente - ${tournament.nombre}`)
                .setDescription(
                    `🇪🇸 ¡Tú equipo ha sido aprobado oficialmente y ha entrado al torneo!\nPara confirmar tu plaza, por favor procesa el pago de la cuota: **${tournament.config.entryFee}€**.\n\n` +
                    `🇬🇧 Your team has been officially approved and entered into the tournament!\nTo confirm your spot, please process the fee payment: **${tournament.config.entryFee}€**.`
                )
                .addFields(
                    { name: '💰 Métodos de Pago / Payment Methods', value: paymentInstructions }
                );

            await user.send({ embeds: [paymentEmbed] });

            // Deshabilitar botones del mensaje de admin
            const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
            disabledRow.components.forEach(c => c.setDisabled(true));
            await interaction.message.edit({ components: [disabledRow] });

            await interaction.editReply(`✅ Equipo aprobado y metido al torneo al instante. MD enviado a <@${captainId}> informando de que debe pagar.`);

        } catch (error) {
            console.error('Error enviando DM:', error);
            await interaction.editReply(`⚠️ Equipo metido en el torneo, pero no se pudo enviar DM. Contacta con <@${captainId}> manualmente para el cobro.`);
        }
        return;
    }

    if (action === 'admin_approve_payment') {
        await interaction.deferUpdate();
        const [tournamentShortId, userId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const pendingData = tournament.teams.pendingPayments?.[userId];

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
            whatsapp: pendingData.whatsapp || '',
            adminMessageId: pendingData.adminMessageId || null,
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

        // --- DAR PERMISO VOZ CANAL B (Aprobados) - background ---
        if (tournament.config?.isPaid && tournament.discordMessageIds?.capitanesAprobadosVoiceId) {
            client.channels.fetch(tournament.discordMessageIds.capitanesAprobadosVoiceId).then(vc => {
                if (vc) vc.permissionOverwrites.create(userId, { ViewChannel: true, Connect: true, Speak: true }).catch(e => console.error('[VOZ] Error Canal B payment:', e));
            }).catch(() => { });
        }

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

    if (action === 'admin_recover_round_start') {
        const [tournamentShortId] = params;
        // ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder already imported at top of file (ES modules)
        const modal = new ModalBuilder()
            .setCustomId(`admin_recover_round_modal:${tournamentShortId}`)
            .setTitle('Regenerar Jornada');

        const roundInput = new TextInputBuilder()
            .setCustomId('round_input')
            .setLabel('¿Qué número de jornada regenerar?')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: 3')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(roundInput));
        return interaction.showModal(modal);
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

    // ========================================================
    // --- BOTONES DE GESTIÓN DE INSCRIPCIONES WEB (DRAFT EXTERNO) ---
    // ========================================================

    async function getExtRegManageMenu(tournamentShortId, dbParam) {
        const trn = await dbParam.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!trn) return null;

        const regPlayersOpen = trn.registrationsClosed === false;
        const regCaptainsClosed = trn.config.registrationClosed === true;

        const pipeline = [
            { $match: { tournamentId: tournamentShortId } },
            { $group: { _id: '$position', count: { $sum: 1 } } }
        ];
        const results = await dbParam.collection('external_draft_registrations').aggregate(pipeline).toArray();
        const menuStats = { GK: 0, DFC: 0, CARR: 0, MC: 0, DC: 0 };
        results.forEach(r => { if (menuStats.hasOwnProperty(r._id)) menuStats[r._id] = r.count; });
        const menuTotal = Object.values(menuStats).reduce((a, b) => a + b, 0);

        const menuLink = `${process.env.BASE_URL}/inscripcion/${tournamentShortId}`;
        const playersStatus = regPlayersOpen ? '🟢 ABIERTAS' : (trn.registrationsClosed === true ? '🔴 CERRADAS' : '⚪ SIN ABRIR');
        const captainsStatus = !regCaptainsClosed ? '🟢 ABIERTAS' : '🔴 CERRADAS';

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ext_reg_open_players:${tournamentShortId}`).setLabel('Abrir Jugadores (Web)').setStyle(ButtonStyle.Success).setEmoji('▶️').setDisabled(regPlayersOpen),
            new ButtonBuilder().setCustomId(`ext_reg_close_players:${tournamentShortId}`).setLabel('Cerrar Jugadores').setStyle(ButtonStyle.Danger).setEmoji('⏹️').setDisabled(!regPlayersOpen)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ext_reg_open_captains:${tournamentShortId}`).setLabel('Abrir Capitanes (Discord)').setStyle(ButtonStyle.Success).setEmoji('👥').setDisabled(!regCaptainsClosed),
            new ButtonBuilder().setCustomId(`ext_reg_close_captains:${tournamentShortId}`).setLabel('Cerrar Capitanes').setStyle(ButtonStyle.Danger).setEmoji('🔒').setDisabled(regCaptainsClosed)
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ext_reg_admin_add_start:${tournamentShortId}`).setLabel('Inscribir Manual').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId(`ext_reg_admin_kick_start:${tournamentShortId}`).setLabel('Expulsar Jugador').setStyle(ButtonStyle.Danger).setEmoji('✖️').setDisabled(menuTotal === 0)
        );

        const row4 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ext_reg_link:${tournamentShortId}`).setLabel('Link Web').setStyle(ButtonStyle.Secondary).setEmoji('🔗'),
            new ButtonBuilder().setCustomId(`ext_reg_export_text:${tournamentShortId}`).setLabel('Exportar TXT').setStyle(ButtonStyle.Secondary).setEmoji('📄').setDisabled(menuTotal === 0),
            new ButtonBuilder().setCustomId(`ext_reg_export_excel:${tournamentShortId}`).setLabel('Exportar Excel').setStyle(ButtonStyle.Secondary).setEmoji('📊').setDisabled(menuTotal === 0)
        );

        const hasListChannel = !!trn.registrationListData?.channelId;
        const row5 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ext_reg_gen_list_channel:${tournamentShortId}`)
                .setLabel(hasListChannel ? 'Borrar Canal Lista' : 'Generar Canal Lista')
                .setStyle(hasListChannel ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji(hasListChannel ? '🗑️' : '📋'),
            new ButtonBuilder()
                .setCustomId(`ext_reg_refresh_list:${tournamentShortId}`)
                .setLabel('Actualizar Listado')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄')
                .setDisabled(!hasListChannel)
        );

        return {
            content: `📋 **Gestión de Inscripciones — ${trn.nombre}**\n\n**Jugadores (Web):** ${playersStatus}\n**Capitanes (Discord):** ${captainsStatus}\n🔗 Link: ${menuLink}\n\n📊 **${menuTotal} inscritos** — 🥅 ${menuStats.GK} POR · 🧱 ${menuStats.DFC} DFC · ⚡ ${menuStats.CARR} CARR · 🎩 ${menuStats.MC} MC · 🏟️ ${menuStats.DC} DC`,
            components: [row1, row2, row3, row4, row5]
        };
    }

    // --- NUEVOS FLUJOS DE ADMINISTRACIÓN DRAFT EXTERNO ---

    if (action === 'ext_reg_admin_add_start') {
        const [tournamentShortId] = params;
        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`ext_reg_admin_add_user_sel:${tournamentShortId}`)
            .setPlaceholder('Selecciona o busca un usuario');

        await interaction.reply({
            content: '🔎 Selecciona al usuario del servidor de Discord al que vas a inscribir manualmente:',
            components: [new ActionRowBuilder().addComponents(userSelect)],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    if (action === 'ext_reg_admin_kick_start') {
        const [tournamentShortId] = params;
        const posMenu = new StringSelectMenuBuilder()
            .setCustomId(`ext_reg_admin_kick_pos:${tournamentShortId}`)
            .setPlaceholder('Filtra por Posición')
            .addOptions([
                { label: 'Porteros (GK)', value: 'GK', emoji: '🥅' },
                { label: 'Defensas (DFC)', value: 'DFC', emoji: '🧱' },
                { label: 'Carrileros (CARR)', value: 'CARR', emoji: '⚡' },
                { label: 'Medios (MC)', value: 'MC', emoji: '🎩' },
                { label: 'Delanteros (DC)', value: 'DC', emoji: '🏟️' }
            ]);

        await interaction.reply({
            content: '📍 Selecciona la **posición** del jugador que quieres expulsar:',
            components: [new ActionRowBuilder().addComponents(posMenu)],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    if (action === 'ext_reg_admin_kick_conf') {
        await interaction.deferUpdate();
        const [tournamentShortId, userId] = params;

        const existing = await db.collection('external_draft_registrations').findOne({
            tournamentId: tournamentShortId,
            userId: userId
        });

        if (existing) {
            await db.collection('external_draft_registrations').deleteOne({ tournamentId: tournamentShortId, userId: userId });

            const trn = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (trn && trn.registrationLogThreadId) {
                const logChannel = await client.channels.fetch(trn.registrationLogThreadId).catch(() => null);
                if (logChannel) {
                    await logChannel.send(`🚨 **EXPULSIÓN (Admin):** <@${userId}> (${existing.gameId} - ${existing.position}) ha sido expulsado del draft por <@${interaction.user.id}>.`);
                }
            }
            await interaction.editReply({ content: `✅ **Jugador <@${userId}> expulsado correctamente.**`, components: [] });

            const menu = await getExtRegManageMenu(tournamentShortId, db);
            if (menu && interaction.message && interaction.message.reference) {
                try {
                    const sourceMsg = await interaction.channel.messages.fetch(interaction.message.reference.messageId);
                    if (sourceMsg) await sourceMsg.edit(menu);
                } catch (e) { }
            }

            // Hook: actualizar canal de lista de inscritos
            scheduleRegistrationListUpdate(client, tournamentShortId);
        } else {
            await interaction.editReply({ content: '❌ El jugador ya había sido eliminado o no se encontró.', components: [] });
        }
        return;
    }

    if (action === 'ext_reg_admin_kick_canc') {
        await interaction.update({ content: '❌ Acción cancelada. No se ha expulsado al jugador.', components: [] });
        return;
    }


    // Botón principal: muestra submenu con todas las opciones
    if (action === 'ext_reg_manage') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const menu = await getExtRegManageMenu(tournamentShortId, db);
        if (!menu) return interaction.editReply('❌ Torneo no encontrado.');
        return interaction.editReply(menu);
    }

    // Abrir inscripciones de Jugadores (WEB)
    if (action === 'ext_reg_open_players') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return;

        // Fetching the specifically requested channel for logs
        const notifChannel = await client.channels.fetch('1402099941685465168').catch(() => null);
        let threadId = tournament.registrationLogThreadId;

        if (!threadId && notifChannel) {
            const thread = await notifChannel.threads.create({
                name: `📋 Log Inscripciones — ${tournament.nombre}`,
                reason: 'Log automático'
            });
            threadId = thread.id;
            await db.collection('tournaments').updateOne(
                { shortId: tournamentShortId },
                { $set: { registrationLogThreadId: threadId, registrationsClosed: false } }
            );
            try {
                await thread.send(`📋 **Log de Inscripciones — ${tournament.nombre}**\nAquí se registran las inscripciones web. <@&${ARBITRO_ROLE_ID}>`);
            } catch (e) {
                console.error(`Error al enviar mensaje inicial al hilo de logs:`, e);
            }
        } else {
            await db.collection('tournaments').updateOne(
                { shortId: tournamentShortId },
                { $set: { registrationsClosed: false } }
            );
        }

        const menu = await getExtRegManageMenu(tournamentShortId, db);
        // Hook: actualizar canal de lista (header con nuevo estado)
        scheduleRegistrationListUpdate(client, tournamentShortId);
        return interaction.editReply(menu);
    }

    // Cerrar inscripciones de Jugadores (WEB)
    if (action === 'ext_reg_close_players') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;

        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { registrationsClosed: true } }
        );

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (tournament && tournament.registrationLogThreadId) {
            const logChannel = await client.channels.fetch(tournament.registrationLogThreadId).catch(() => null);
            if (logChannel) {
                const pipeline = [
                    { $match: { tournamentId: tournamentShortId } },
                    { $group: { _id: '$position', count: { $sum: 1 } } }
                ];
                const results = await db.collection('external_draft_registrations').aggregate(pipeline).toArray();
                const stats = { GK: 0, DFC: 0, CARR: 0, MC: 0, DC: 0 };
                results.forEach(r => { if (stats.hasOwnProperty(r._id)) stats[r._id] = r.count; });
                const total = Object.values(stats).reduce((a, b) => a + b, 0);
                await logChannel.send(`🔒 **INSCRIPCIONES WEB CERRADAS**\nTotal final: ${total} inscritos`);
            }
        }

        const menu = await getExtRegManageMenu(tournamentShortId, db);
        // Hook: actualizar canal de lista (header con nuevo estado)
        scheduleRegistrationListUpdate(client, tournamentShortId);
        return interaction.editReply(menu);
    }

    // Abrir inscripciones de Capitanes (DISCORD)
    if (action === 'ext_reg_open_captains') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'config.registrationClosed': false } }
        );
        const menu = await getExtRegManageMenu(tournamentShortId, db);
        // Hook: actualizar canal de lista (header)
        scheduleRegistrationListUpdate(client, tournamentShortId);
        return interaction.editReply(menu);
    }

    // Cerrar inscripciones de Capitanes (DISCORD)
    if (action === 'ext_reg_close_captains') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: { 'config.registrationClosed': true } }
        );
        const menu = await getExtRegManageMenu(tournamentShortId, db);
        // Hook: actualizar canal de lista (header)
        scheduleRegistrationListUpdate(client, tournamentShortId);
        return interaction.editReply(menu);
    }

    // Generar Canal Lista / Borrar Canal Lista
    if (action === 'ext_reg_gen_list_channel') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return;

        if (tournament.registrationListData?.channelId) {
            // Ya existe → borrar
            await deleteRegistrationListChannel(client, tournament);
            const menu = await getExtRegManageMenu(tournamentShortId, db);
            return interaction.editReply(menu);
        } else {
            // No existe → crear
            const guild = interaction.guild;
            const result = await createRegistrationListChannel(client, guild, tournament);
            if (result) {
                const menu = await getExtRegManageMenu(tournamentShortId, db);
                return interaction.editReply(menu);
            } else {
                return interaction.followUp({ content: '❌ Error al crear el canal de lista.', flags: [MessageFlags.Ephemeral] });
            }
        }
    }

    // Actualizar Listado (forzar refresh manual)
    if (action === 'ext_reg_refresh_list') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        await forceRefreshRegistrationList(client, tournamentShortId);
        const menu = await getExtRegManageMenu(tournamentShortId, db);
        return interaction.editReply(menu);
    }

    // Generar link de inscripción
    if (action === 'ext_reg_link') {
        const [tournamentShortId] = params;
        const link = `${process.env.BASE_URL}/inscripcion/${tournamentShortId}`;
        return interaction.reply({ content: `🔗 **Link de inscripción:**\n${link}`, flags: [MessageFlags.Ephemeral] });
    }

    // ========================================================
    // --- NUEVOS HANDLERS: FLUJO REGISTRO JUGADOR DRAFT EXTERNO ---
    // ========================================================

    if (action === 'ext_reg_edit_start') {
        const [tournamentShortId] = params;

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`ext_reg_player_pos:${tournamentShortId}`)
            .setPlaceholder('Selecciona tu NUEVA posición...')
            .addOptions([
                { label: 'Portero (POR)', value: 'GK', emoji: '🥅' },
                { label: 'Defensa (DFC)', value: 'DFC', emoji: '🧱' },
                { label: 'Carrilero (CARR)', value: 'CARR', emoji: '⚡' },
                { label: 'Medio (MC)', value: 'MC', emoji: '🎩' },
                { label: 'Delantero (DC)', value: 'DC', emoji: '🏟️' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.update({
            content: `👤 **Editando tu inscripción**\n\n¿En qué posición quieres jugar ahora? Moveremos tu inscripción a esa posición.\n*(Tendrás que volver a escribir tu ID y WhatsApp en el siguiente paso)*`,
            components: [row]
        });
    }

    if (action === 'ext_reg_cancel') {
        const [tournamentShortId] = params;

        const existing = await db.collection('external_draft_registrations').findOne({
            tournamentId: tournamentShortId,
            $or: [{ userId: interaction.user.id }, { discordId: interaction.user.id }]
        });

        if (existing) {
            await db.collection('external_draft_registrations').deleteOne({
                _id: existing._id
            });

            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (tournament && tournament.registrationLogThreadId) {
                const logChannel = await client.channels.fetch(tournament.registrationLogThreadId).catch(() => null);
                if (logChannel) {
                    await logChannel.send(`❌ **BAJA JUGADOR (Discord):** <@${interaction.user.id}> (${existing.gameId}) se ha dado de baja. Liberada plaza de **${existing.position}**.`);
                }
            }
        }

        // Hook: actualizar canal de lista de inscritos
        scheduleRegistrationListUpdate(client, tournamentShortId);

        return interaction.update({
            content: `✅ **Baja completada.** Te has dado de baja de este Draft correctamente. Ya no ocupas plaza.`,
            components: []
        });
    }

    // Exportar lista WhatsApp (texto)
    if (action === 'ext_reg_export_text') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;

        const registrations = await db.collection('external_draft_registrations')
            .find({ tournamentId: tournamentShortId })
            .sort({ createdAt: 1 })
            .toArray();

        if (registrations.length === 0) {
            return interaction.editReply('No hay inscritos aún.');
        }

        const groups = { GK: [], DFC: [], CARR: [], MC: [], DC: [] };
        registrations.forEach(r => { if (groups[r.position]) groups[r.position].push(r); });

        const posEmojis = { GK: '🥅', DFC: '🧱', CARR: '⚡', MC: '🎩', DC: '🏟' };
        const posNames = { GK: 'PORTEROS', DFC: 'DEFENSAS', CARR: 'CARRILEROS', MC: 'MEDIOS', DC: 'DELANTEROS' };

        let text = '';
        for (const pos of ['GK', 'DFC', 'CARR', 'MC', 'DC']) {
            text += `${posNames[pos]}${posEmojis[pos]}\n\n`;
            groups[pos].forEach((r, i) => {
                text += `${i + 1}. ${r.gameId}\n📲${r.whatsapp}\n`;
            });
            text += '\n';
        }

        const buffer = Buffer.from(text, 'utf-8');
        return interaction.editReply({
            content: `📋 Lista de ${registrations.length} inscritos:`,
            files: [{ attachment: buffer, name: `inscritos_${tournamentShortId}.txt` }]
        });
    }

    // Exportar Excel con colores por posición
    if (action === 'ext_reg_export_excel') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;

        const registrations = await db.collection('external_draft_registrations')
            .find({ tournamentId: tournamentShortId })
            .sort({ createdAt: 1 })
            .toArray();

        if (registrations.length === 0) {
            return interaction.editReply('No hay inscritos aún.');
        }

        const posColumns = {
            'GK': { header: 'PORTEROS', color: 'FFFFFF00', players: [] },
            'DFC': { header: 'DEFENSAS', color: 'FF00CC00', players: [] },
            'CARR': { header: 'CARRILEROS', color: 'FF00BFFF', players: [] },
            'MC': { header: 'MEDIOS', color: 'FFFF8C00', players: [] },
            'DC': { header: 'DELANTEROS', color: 'FFFF3333', players: [] }
        };

        registrations.forEach(r => {
            const key = r.position || 'DC';
            if (posColumns[key]) {
                const idx = posColumns[key].players.length + 1;
                posColumns[key].players.push(`${idx}. ${r.gameId}`);
            }
        });

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Inscritos');
        const columnKeys = ['GK', 'DFC', 'CARR', 'MC', 'DC'];

        // Cabeceras con color
        const headerRow = ws.getRow(1);
        columnKeys.forEach((key, colIdx) => {
            const cell = headerRow.getCell(colIdx + 1);
            cell.value = posColumns[key].header;
            cell.font = { bold: true, color: { argb: 'FF000000' }, size: 12 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: posColumns[key].color } };
            cell.alignment = { horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        // Rellenar jugadores por columna
        const maxRows = Math.max(...columnKeys.map(k => posColumns[k].players.length));
        for (let r = 0; r < maxRows; r++) {
            const row = ws.getRow(r + 2);
            row.height = 35; // Para que quepan las 2 líneas (nombre + whatsapp)
            columnKeys.forEach((key, colIdx) => {
                const cell = row.getCell(colIdx + 1);
                const playerList = posColumns[key].players;
                cell.value = r < playerList.length ? playerList[r] : '';
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: posColumns[key].color } };
                cell.alignment = { wrapText: true, vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
        }

        ws.columns = columnKeys.map(() => ({ width: 28 }));

        const excelBuffer = await workbook.xlsx.writeBuffer();
        return interaction.editReply({
            content: `📊 Excel con ${registrations.length} inscritos (columnas por posición):`,
            files: [{ attachment: Buffer.from(excelBuffer), name: `inscritos_${tournamentShortId}.xlsx` }]
        });
    }

    // =======================================================
    // --- SISTEMA DE BOLSA DE EQUIPOS ---
    // =======================================================

    // Helper: actualizar embed público de la bolsa
    async function updatePoolPublicEmbed(pool) {
        try {
            const channel = await client.channels.fetch(pool.discordChannelId).catch(() => null);
            if (!channel) return;
            const message = await channel.messages.fetch(pool.discordMessageId).catch(() => null);
            if (!message) return;
            const updatedPool = await db.collection('team_pools').findOne({ _id: pool._id });
            const embedContent = createPoolEmbed(updatedPool);
            await message.edit(embedContent);
        } catch (e) {
            console.warn('[POOL] Error actualizando embed público:', e.message);
        }
    }

    // Helper: enviar log al hilo de la bolsa
    async function sendPoolLog(pool, message) {
        try {
            if (!pool.logThreadId) return;
            const thread = await client.channels.fetch(pool.logThreadId).catch(() => null);
            if (thread) await thread.send(message);
        } catch (e) {
            console.warn('[POOL LOG] Error enviando log:', e.message);
        }
    }

    // Helper: generar resumen de equipos por liga
    function poolSummaryLine(pool) {
        const teams = Object.values(pool.teams || {});
        const counts = { DIAMOND: 0, GOLD: 0, SILVER: 0, BRONZE: 0 };
        teams.forEach(t => {
            if (counts.hasOwnProperty(t.league)) counts[t.league]++;
            else counts['BRONZE']++;
        });
        const total = teams.length;
        return `📊 Resumen: ${counts.DIAMOND} 💎 Diamond · ${counts.GOLD} 👑 Gold · ${counts.SILVER} ⚙️ Silver · ${counts.BRONZE} 🥉 Bronze = **${total} total**`;
    }

    // --- CREAR BOLSA: Abrir modal ---
    if (action === 'admin_create_pool_start') {
        const modal = new ModalBuilder()
            .setCustomId('admin_create_pool_modal')
            .setTitle('Crear Nueva Bolsa de Equipos');

        const nameInput = new TextInputBuilder()
            .setCustomId('pool_name')
            .setLabel('Nombre de la Bolsa')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Bolsa Torneos Abril')
            .setRequired(true);

        const imageInput = new TextInputBuilder()
            .setCustomId('pool_image')
            .setLabel('URL de Imagen (opcional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://i.imgur.com/ejemplo.png')
            .setRequired(false);

        const minEloInput = new TextInputBuilder()
            .setCustomId('pool_min_elo')
            .setLabel('ELO Mínimo (vacío = sin mínimo)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: 1000 (Silver+), 1300 (Gold+), 1550 (Diamond)')
            .setRequired(false);

        const maxEloInput = new TextInputBuilder()
            .setCustomId('pool_max_elo')
            .setLabel('ELO Máximo (vacío = sin máximo)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: 1299 (solo Silver/Bronze), 1549 (hasta Gold)')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(imageInput),
            new ActionRowBuilder().addComponents(minEloInput),
            new ActionRowBuilder().addComponents(maxEloInput)
        );
        await interaction.showModal(modal);
        return;
    }

    // --- GESTIONAR BOLSAS: Listar bolsas activas ---
    if (action === 'admin_list_pools') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const pools = await db.collection('team_pools').find({
            guildId: guild.id,
            status: { $ne: 'closed' }
        }).sort({ createdAt: -1 }).toArray();

        if (pools.length === 0) {
            return interaction.editReply('No hay bolsas activas. Crea una desde "Crear Bolsa".');
        }

        const poolOptions = pools.map(p => {
            const teamCount = Object.keys(p.teams || {}).length;
            return {
                label: p.name,
                description: `${teamCount} equipos | Estado: ${p.status} | ID: ${p.shortId}`,
                value: p.shortId
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_select_pool:manage')
            .setPlaceholder('Selecciona una bolsa para gestionar')
            .addOptions(poolOptions.slice(0, 25));

        await interaction.editReply({
            content: `📦 **${pools.length} bolsa(s) activa(s).** Selecciona una para gestionar:`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    // --- INSCRIBIRSE EN LA BOLSA ---
    if (action === 'pool_register') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [poolShortId] = params;
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });

        if (!pool) return interaction.editReply('❌ Bolsa no encontrada.');
        if (pool.status !== 'open') return interaction.editReply('🔒 La inscripción de esta bolsa está pausada o cerrada.');

        const userId = interaction.user.id;
        const testDb = getDb('test');

        // Buscar equipo del usuario (como manager o como capitán)
        const userTeam = await testDb.collection('teams').findOne({
            guildId: guild.id,
            $or: [
                { managerId: userId },
                { captains: userId }
            ]
        });

        if (!userTeam) {
            return interaction.editReply('❌ No tienes un equipo registrado en este servidor. Debes tener un equipo para inscribirte.');
        }

        const { getBotSettings } = await import('../../database.js');
        const settings = await getBotSettings();
        if (settings.eaScannerEnabled && !userTeam.eaClubId) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('team_link_ea_button')
                    .setLabel('🎮 Vincular Club EA')
                    .setStyle(ButtonStyle.Success)
            );
            return interaction.editReply({ 
                content: '❌ **Inscripción bloqueada.**\n\nEl sistema de estadísticas de EA Sports está activado en este servidor. Debes vincular tu Club de EA y esperar a que sea aprobado por un administrador antes de poder inscribirte.',
                components: [row]
            });
        }


        // Verificar strikes
        if ((userTeam.strikes || 0) >= 3) {
            return interaction.editReply(`🚫 Tu equipo **${userTeam.name}** tiene **${userTeam.strikes} strikes**. Los equipos con 3 o más strikes no pueden inscribirse.`);
        }

        // Verificar si está baneado de esta bolsa
        if (pool.bannedTeams && pool.bannedTeams.includes(userTeam._id.toString())) {
            return interaction.editReply(`🚫 Tu equipo **${userTeam.name}** está **baneado** de esta bolsa.`);
        }

        // Verificar si el equipo ya está inscrito por cualquier persona
        const existingEntry = Object.values(pool.teams || {}).find(t => t.teamDbId === userTeam._id.toString());
        if (existingEntry) {
            return interaction.editReply(`⚠️ Tu equipo **${userTeam.name}** ya está inscrito en esta bolsa (inscrito por <@${existingEntry.inscritoPor}>).`);
        }

        // Verificar filtro de ELO
        const teamElo = userTeam.elo || 1000;
        const teamLeague = getLeagueByElo(teamElo);

        if (pool.minElo && teamElo < pool.minElo) {
            return interaction.editReply(`🚫 Tu equipo **${userTeam.name}** tiene **${teamElo} ELO**, pero esta bolsa requiere mínimo **${pool.minElo} ELO**.`);
        }
        if (pool.maxElo && teamElo > pool.maxElo) {
            return interaction.editReply(`🚫 Tu equipo **${userTeam.name}** tiene **${teamElo} ELO**, pero esta bolsa permite máximo **${pool.maxElo} ELO**.`);
        }

        // Inscribir al equipo
        const teamEntry = {
            teamDbId: userTeam._id.toString(),
            teamName: userTeam.name,
            managerId: userTeam.managerId || userId,
            captains: userTeam.captains || [],
            elo: teamElo,
            league: teamLeague,
            logoUrl: userTeam.logoUrl || null,
            inscritoEn: new Date(),
            inscritoPor: userId,
            inscritoVia: 'discord'
        };

        // Usamos managerId como key para evitar duplicados
        const entryKey = userTeam.managerId || userTeam._id.toString();
        await db.collection('team_pools').updateOne(
            { _id: pool._id },
            { $set: { [`teams.${entryKey}`]: teamEntry } }
        );

        const updatedPool = await db.collection('team_pools').findOne({ _id: pool._id });
        const leagueEmoji = LEAGUE_EMOJIS[teamLeague] || '🥉';

        // Actualizar embed público
        await updatePoolPublicEmbed(updatedPool);

        // Enviar log
        await sendPoolLog(updatedPool, `✅ Se ha inscrito **${userTeam.name}** (ELO: ${teamElo} — ${leagueEmoji} ${teamLeague}) — inscrito por <@${userId}>\n${poolSummaryLine(updatedPool)}`);

        await interaction.editReply(`✅ ¡Tu equipo **${userTeam.name}** (${leagueEmoji} ${teamLeague} — ELO: ${teamElo}) ha sido inscrito en la bolsa **${pool.name}**!`);
        return;
    }

    // --- VER PARTICIPANTES ---
    if (action === 'pool_participants') {
        const [poolShortId, pageStr] = params;
        const page = parseInt(pageStr) || 0;
        if (page > 0) { await interaction.deferUpdate(); } else { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); }
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });

        if (!pool) return interaction.editReply('❌ Bolsa no encontrada.');

        const teams = Object.values(pool.teams || {});

        if (teams.length === 0) {
            return interaction.editReply(`📦 **${pool.name}** — No hay equipos inscritos todavía.`);
        }

        // Ordenar por ELO descendente
        teams.sort((a, b) => b.elo - a.elo);

        // Agrupar por liga
        const grouped = { DIAMOND: [], GOLD: [], SILVER: [], BRONZE: [] };
        teams.forEach(t => {
            const league = grouped[t.league] ? t.league : 'BRONZE';
            grouped[league].push(t);
        });

        const leagueLabels = {
            DIAMOND: '💎 Diamond',
            GOLD: '👑 Gold',
            SILVER: '⚙️ Silver',
            BRONZE: '🥉 Bronze'
        };

        // Construir lista plana con encabezados de liga
        const allLines = [];
        for (const league of ['DIAMOND', 'GOLD', 'SILVER', 'BRONZE']) {
            if (grouped[league].length > 0) {
                allLines.push(`\n**${leagueLabels[league]}** (${grouped[league].length})`);
                grouped[league].forEach((t, i) => {
                    allLines.push(`${i + 1}. ${t.teamName} — ELO: ${t.elo}`);
                });
            }
        }

        const ITEMS_PER_PAGE = 20;
        const totalPages = Math.ceil(allLines.length / ITEMS_PER_PAGE);
        const currentPage = Math.min(page, totalPages - 1);
        const startIdx = currentPage * ITEMS_PER_PAGE;
        const pageLines = allLines.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        const description = pageLines.join('\n');

        const embed = new EmbedBuilder()
            .setColor('#00e5ff')
            .setTitle(`👥 Participantes: ${pool.name}`)
            .setDescription(`**${teams.length}** equipos inscritos\n${description}`)
            .setFooter({ text: `Página ${currentPage + 1}/${totalPages} · ID: ${pool.shortId}` });

        const components = [];
        if (totalPages > 1) {
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`pool_participants:${poolShortId}:${currentPage - 1}`)
                    .setLabel('◀ Anterior')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId(`pool_participants:${poolShortId}:${currentPage + 1}`)
                    .setLabel('Siguiente ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage >= totalPages - 1)
            );
            components.push(navRow);
        }

        await interaction.editReply({ embeds: [embed], components });
        return;
    }

    // --- DARSE DE BAJA ---
    if (action === 'pool_unregister') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [poolShortId] = params;
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });

        if (!pool) return interaction.editReply('❌ Bolsa no encontrada.');

        const userId = interaction.user.id;
        const testDb = getDb('test');

        const userTeam = await testDb.collection('teams').findOne({
            guildId: guild.id,
            $or: [{ managerId: userId }, { captains: userId }]
        });

        if (!userTeam) return interaction.editReply('❌ No tienes un equipo registrado.');

        // Buscar la entrada del equipo en la bolsa
        let entryKey = null;
        for (const [key, entry] of Object.entries(pool.teams || {})) {
            if (entry.teamDbId === userTeam._id.toString()) {
                entryKey = key;
                break;
            }
        }

        if (!entryKey) {
            return interaction.editReply('❌ Tu equipo no está inscrito en esta bolsa.');
        }

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pool_unregister_confirm:${poolShortId}`)
                .setLabel('Sí, darme de baja')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('pool_unregister_cancel')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({
            content: `⚠️ ¿Estás seguro de que quieres **dar de baja** a tu equipo **${userTeam.name}** de la bolsa **${pool.name}**?`,
            components: [confirmRow]
        });
        return;
    }

    if (action === 'pool_unregister_confirm') {
        await interaction.deferUpdate();
        const [poolShortId] = params;
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        if (!pool) return interaction.editReply({ content: '❌ Bolsa no encontrada.', components: [] });

        const userId = interaction.user.id;
        const testDb = getDb('test');
        const userTeam = await testDb.collection('teams').findOne({
            guildId: guild.id,
            $or: [{ managerId: userId }, { captains: userId }]
        });
        if (!userTeam) return interaction.editReply({ content: '❌ Error.', components: [] });

        let entryKey = null;
        for (const [key, entry] of Object.entries(pool.teams || {})) {
            if (entry.teamDbId === userTeam._id.toString()) {
                entryKey = key;
                break;
            }
        }
        if (!entryKey) return interaction.editReply({ content: '❌ Tu equipo ya no está en la bolsa.', components: [] });

        await db.collection('team_pools').updateOne(
            { _id: pool._id },
            { $unset: { [`teams.${entryKey}`]: '' } }
        );

        const updatedPool = await db.collection('team_pools').findOne({ _id: pool._id });
        await updatePoolPublicEmbed(updatedPool);
        await sendPoolLog(updatedPool, `❌ **${userTeam.name}** se ha dado de baja — solicitado por <@${userId}>\n${poolSummaryLine(updatedPool)}`);

        await interaction.editReply({ content: `✅ Tu equipo **${userTeam.name}** ha sido dado de baja de la bolsa **${pool.name}**.`, components: [] });
        return;
    }

    if (action === 'pool_unregister_cancel') {
        await interaction.update({ content: '❌ Operación cancelada.', components: [] });
        return;
    }

    // --- PANEL ADMIN DE LA BOLSA ---
    if (action === 'pool_admin_panel') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [poolShortId] = params;
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        if (!pool) return interaction.editReply('❌ Bolsa no encontrada.');

        const teamCount = Object.keys(pool.teams || {}).length;
        const statusLabel = pool.status === 'open' ? '🟢 Abierta' : pool.status === 'paused' ? '🔒 Pausada' : '🛑 Cerrada';

        const embed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle(`⚙️ Gestión: ${pool.name}`)
            .setDescription(`**Estado:** ${statusLabel}\n**Equipos:** ${teamCount}\n${poolSummaryLine(pool)}`)
            .setFooter({ text: `ID: ${pool.shortId}` });

        const row1 = new ActionRowBuilder().addComponents(
            pool.status === 'open'
                ? new ButtonBuilder().setCustomId(`pool_admin_pause:${poolShortId}`).setLabel('Pausar Inscripción').setStyle(ButtonStyle.Danger).setEmoji('⏸️')
                : new ButtonBuilder().setCustomId(`pool_admin_resume:${poolShortId}`).setLabel('Abrir Inscripción').setStyle(ButtonStyle.Success).setEmoji('▶️'),
            new ButtonBuilder().setCustomId(`pool_admin_edit:${poolShortId}`).setLabel('Editar Nombre/Imagen').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId(`pool_admin_add_manual:${poolShortId}`).setLabel('Añadir Equipo').setStyle(ButtonStyle.Success).setEmoji('➕')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pool_admin_kick:${poolShortId}`).setLabel('Expulsar Equipo').setStyle(ButtonStyle.Danger).setEmoji('👢').setDisabled(teamCount === 0),
            new ButtonBuilder().setCustomId(`pool_admin_ban:${poolShortId}`).setLabel('Banear Equipo').setStyle(ButtonStyle.Danger).setEmoji('🚫').setDisabled(teamCount === 0),
            new ButtonBuilder().setCustomId(`pool_admin_clear:${poolShortId}`).setLabel('Limpiar Bolsa').setStyle(ButtonStyle.Danger).setEmoji('🧹').setDisabled(teamCount === 0),
            new ButtonBuilder().setCustomId(`pool_admin_delete:${poolShortId}`).setLabel('Borrar Bolsa').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );

        await interaction.editReply({ embeds: [embed], components: [row1, row2] });
        return;
    }

    // --- PAUSAR / ABRIR INSCRIPCIÓN ---
    if (action === 'pool_admin_pause') {
        await interaction.deferUpdate();
        const [poolShortId] = params;
        await db.collection('team_pools').updateOne({ shortId: poolShortId }, { $set: { status: 'paused' } });
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        await updatePoolPublicEmbed(pool);
        await sendPoolLog(pool, `⏸️ La inscripción ha sido **pausada** por <@${interaction.user.id}>.`);
        // Re-render admin panel
        const teamCount = Object.keys(pool.teams || {}).length;
        const embed = new EmbedBuilder().setColor('#e67e22').setTitle(`⚙️ Gestión: ${pool.name}`).setDescription(`**Estado:** 🔒 Pausada\n**Equipos:** ${teamCount}\n${poolSummaryLine(pool)}`).setFooter({ text: `ID: ${pool.shortId}` });
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pool_admin_resume:${poolShortId}`).setLabel('Abrir Inscripción').setStyle(ButtonStyle.Success).setEmoji('▶️'),
            new ButtonBuilder().setCustomId(`pool_admin_edit:${poolShortId}`).setLabel('Editar Nombre/Imagen').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId(`pool_admin_add_manual:${poolShortId}`).setLabel('Añadir Equipo').setStyle(ButtonStyle.Success).setEmoji('➕')
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pool_admin_kick:${poolShortId}`).setLabel('Expulsar Equipo').setStyle(ButtonStyle.Danger).setEmoji('👢').setDisabled(teamCount === 0),
            new ButtonBuilder().setCustomId(`pool_admin_ban:${poolShortId}`).setLabel('Banear Equipo').setStyle(ButtonStyle.Danger).setEmoji('🚫').setDisabled(teamCount === 0),
            new ButtonBuilder().setCustomId(`pool_admin_clear:${poolShortId}`).setLabel('Limpiar Bolsa').setStyle(ButtonStyle.Danger).setEmoji('🧹').setDisabled(teamCount === 0),
            new ButtonBuilder().setCustomId(`pool_admin_delete:${poolShortId}`).setLabel('Borrar Bolsa').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );
        await interaction.editReply({ embeds: [embed], components: [row1, row2] });
        return;
    }

    if (action === 'pool_admin_resume') {
        await interaction.deferUpdate();
        const [poolShortId] = params;
        await db.collection('team_pools').updateOne({ shortId: poolShortId }, { $set: { status: 'open' } });
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        await updatePoolPublicEmbed(pool);
        await sendPoolLog(pool, `▶️ La inscripción ha sido **reabierta** por <@${interaction.user.id}>.`);
        const teamCount = Object.keys(pool.teams || {}).length;
        const embed = new EmbedBuilder().setColor('#e67e22').setTitle(`⚙️ Gestión: ${pool.name}`).setDescription(`**Estado:** 🟢 Abierta\n**Equipos:** ${teamCount}\n${poolSummaryLine(pool)}`).setFooter({ text: `ID: ${pool.shortId}` });
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pool_admin_pause:${poolShortId}`).setLabel('Pausar Inscripción').setStyle(ButtonStyle.Danger).setEmoji('⏸️'),
            new ButtonBuilder().setCustomId(`pool_admin_edit:${poolShortId}`).setLabel('Editar Nombre/Imagen').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId(`pool_admin_add_manual:${poolShortId}`).setLabel('Añadir Equipo').setStyle(ButtonStyle.Success).setEmoji('➕')
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pool_admin_kick:${poolShortId}`).setLabel('Expulsar Equipo').setStyle(ButtonStyle.Danger).setEmoji('👢').setDisabled(teamCount === 0),
            new ButtonBuilder().setCustomId(`pool_admin_ban:${poolShortId}`).setLabel('Banear Equipo').setStyle(ButtonStyle.Danger).setEmoji('🚫').setDisabled(teamCount === 0),
            new ButtonBuilder().setCustomId(`pool_admin_clear:${poolShortId}`).setLabel('Limpiar Bolsa').setStyle(ButtonStyle.Danger).setEmoji('🧹').setDisabled(teamCount === 0),
            new ButtonBuilder().setCustomId(`pool_admin_delete:${poolShortId}`).setLabel('Borrar Bolsa').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );
        await interaction.editReply({ embeds: [embed], components: [row1, row2] });
        return;
    }

    // --- LIMPIAR BOLSA ---
    if (action === 'pool_admin_clear') {
        const [poolShortId] = params;
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pool_admin_clear_confirm:${poolShortId}`).setLabel('Sí, limpiar toda la bolsa').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('pool_admin_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: '⚠️ **¿Estás seguro?** Esto eliminará TODOS los equipos de esta bolsa.', components: [confirmRow], flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'pool_admin_clear_confirm') {
        await interaction.deferUpdate();
        const [poolShortId] = params;
        await db.collection('team_pools').updateOne({ shortId: poolShortId }, { $set: { teams: {} } });
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        await updatePoolPublicEmbed(pool);
        await sendPoolLog(pool, `🧹 La bolsa ha sido **limpiada** por <@${interaction.user.id}>. Todos los equipos han sido removidos.`);
        await interaction.editReply({ content: '✅ Bolsa limpiada. Todos los equipos han sido eliminados.', components: [] });
        return;
    }

    // --- BORRAR BOLSA ---
    if (action === 'pool_admin_delete') {
        const [poolShortId] = params;
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pool_admin_delete_confirm:${poolShortId}`).setLabel('Sí, BORRAR la bolsa').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('pool_admin_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: '🗑️ **¿Estás seguro?** Esto borrará la bolsa, su embed público y cerrará el hilo de log. Esta acción es **irreversible**.', components: [confirmRow], flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'pool_admin_delete_confirm') {
        await interaction.deferUpdate();
        const [poolShortId] = params;
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        if (!pool) return interaction.editReply({ content: '❌ Bolsa no encontrada.', components: [] });

        // Borrar embed público
        try {
            const channel = await client.channels.fetch(pool.discordChannelId).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(pool.discordMessageId).catch(() => null);
                if (msg) await msg.delete().catch(() => {});
            }
        } catch (e) { /* ignore */ }

        // Archivar hilo
        try {
            const thread = await client.channels.fetch(pool.logThreadId).catch(() => null);
            if (thread) await thread.setArchived(true).catch(() => {});
        } catch (e) { /* ignore */ }

        await db.collection('team_pools').deleteOne({ _id: pool._id });
        await interaction.editReply({ content: `✅ La bolsa **${pool.name}** ha sido completamente borrada.`, components: [] });
        return;
    }

    if (action === 'pool_admin_cancel') {
        await interaction.update({ content: '❌ Operación cancelada.', components: [] });
        return;
    }

    // --- EDITAR BOLSA: Modal ---
    if (action === 'pool_admin_edit') {
        const [poolShortId] = params;
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        if (!pool) return interaction.reply({ content: '❌ Bolsa no encontrada.', flags: [MessageFlags.Ephemeral] });

        const modal = new ModalBuilder()
            .setCustomId(`pool_admin_edit_modal:${poolShortId}`)
            .setTitle('Editar Bolsa');

        const nameInput = new TextInputBuilder()
            .setCustomId('pool_name')
            .setLabel('Nombre de la Bolsa')
            .setStyle(TextInputStyle.Short)
            .setValue(pool.name)
            .setRequired(true);

        const imageInput = new TextInputBuilder()
            .setCustomId('pool_image')
            .setLabel('URL de Imagen (vacío para quitar)')
            .setStyle(TextInputStyle.Short)
            .setValue(pool.imageUrl || '')
            .setRequired(false);

        const minEloInput = new TextInputBuilder()
            .setCustomId('pool_min_elo')
            .setLabel('ELO Mínimo (vacío = sin mínimo)')
            .setStyle(TextInputStyle.Short)
            .setValue(pool.minElo ? String(pool.minElo) : '')
            .setPlaceholder('Ej: 1000 (Silver+), 1300 (Gold+)')
            .setRequired(false);

        const maxEloInput = new TextInputBuilder()
            .setCustomId('pool_max_elo')
            .setLabel('ELO Máximo (vacío = sin máximo)')
            .setStyle(TextInputStyle.Short)
            .setValue(pool.maxElo ? String(pool.maxElo) : '')
            .setPlaceholder('Ej: 1299 (solo Silver/Bronze)')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(imageInput),
            new ActionRowBuilder().addComponents(minEloInput),
            new ActionRowBuilder().addComponents(maxEloInput)
        );
        await interaction.showModal(modal);
        return;
    }

    // --- AÑADIR EQUIPO MANUAL ---
    if (action === 'pool_admin_add_manual') {
        const [poolShortId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`pool_admin_add_manual_modal:${poolShortId}`)
            .setTitle('Añadir Equipo a la Bolsa');

        const searchInput = new TextInputBuilder()
            .setCustomId('team_search')
            .setLabel('Nombre del equipo (o parte)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Real, City, United...')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
        await interaction.showModal(modal);
        return;
    }

    // --- EXPULSAR EQUIPO ---
    if (action === 'pool_admin_kick') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [poolShortId, pageStr] = params;
        const page = parseInt(pageStr) || 0;
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        if (!pool) return interaction.editReply('❌ Bolsa no encontrada.');

        const teams = Object.entries(pool.teams || {});
        if (teams.length === 0) return interaction.editReply('❌ No hay equipos en la bolsa.');

        // Paginar si >25
        const ITEMS_PER_PAGE = 25;
        const totalPages = Math.ceil(teams.length / ITEMS_PER_PAGE);
        const currentPage = Math.min(page, totalPages - 1);
        const pageTeams = teams.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

        const teamOptions = pageTeams.map(([key, t]) => ({
            label: t.teamName,
            description: `ELO: ${t.elo} | ${t.league}`,
            value: key
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`pool_admin_kick_select:${poolShortId}`)
            .setPlaceholder('Selecciona un equipo para expulsar')
            .addOptions(teamOptions);

        const components = [new ActionRowBuilder().addComponents(selectMenu)];

        if (totalPages > 1) {
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`pool_admin_kick:${poolShortId}:${currentPage - 1}`)
                    .setLabel('◀ Anterior')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId(`pool_admin_kick:${poolShortId}:${currentPage + 1}`)
                    .setLabel('Siguiente ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage >= totalPages - 1)
            );
            components.push(navRow);
        }

        await interaction.editReply({
            content: `👢 Selecciona el equipo que deseas **expulsar** (${teams.length} equipos${totalPages > 1 ? ` · Pág ${currentPage + 1}/${totalPages}` : ''}):`,
            components
        });
        return;
    }

    // --- BANEAR EQUIPO ---
    if (action === 'pool_admin_ban') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [poolShortId, pageStr] = params;
        const page = parseInt(pageStr) || 0;
        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        if (!pool) return interaction.editReply('❌ Bolsa no encontrada.');

        const teams = Object.entries(pool.teams || {});
        if (teams.length === 0) return interaction.editReply('❌ No hay equipos en la bolsa.');

        // Paginar si >25
        const ITEMS_PER_PAGE = 25;
        const totalPages = Math.ceil(teams.length / ITEMS_PER_PAGE);
        const currentPage = Math.min(page, totalPages - 1);
        const pageTeams = teams.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

        const teamOptions = pageTeams.map(([key, t]) => ({
            label: t.teamName,
            description: `ELO: ${t.elo} | ${t.league}`,
            value: key
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`pool_admin_ban_select:${poolShortId}`)
            .setPlaceholder('Selecciona un equipo para BANEAR de la bolsa')
            .addOptions(teamOptions);

        const components = [new ActionRowBuilder().addComponents(selectMenu)];

        if (totalPages > 1) {
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`pool_admin_ban:${poolShortId}:${currentPage - 1}`)
                    .setLabel('◀ Anterior')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId(`pool_admin_ban:${poolShortId}:${currentPage + 1}`)
                    .setLabel('Siguiente ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage >= totalPages - 1)
            );
            components.push(navRow);
        }

        await interaction.editReply({
            content: `🚫 Selecciona el equipo que deseas **banear** (${teams.length} equipos${totalPages > 1 ? ` · Pág ${currentPage + 1}/${totalPages}` : ''}):`,
            components
        });
        return;
    }

    // --- STRIKES: Editar strikes de equipo ---
    if (action === 'admin_edit_team_strikes_start') {
        const [teamDbId] = params;
        const testDb = getDb('test');
        const team = await testDb.collection('teams').findOne({ _id: new ObjectId(teamDbId) });
        if (!team) return interaction.reply({ content: '❌ Equipo no encontrado.', flags: [MessageFlags.Ephemeral] });

        const modal = new ModalBuilder()
            .setCustomId(`admin_edit_team_strikes_modal:${teamDbId}`)
            .setTitle(`Strikes: ${team.name}`);

        const strikesInput = new TextInputBuilder()
            .setCustomId('strikes_value')
            .setLabel(`Strikes actuales: ${team.strikes || 0}. Nuevo valor:`)
            .setStyle(TextInputStyle.Short)
            .setValue(String(team.strikes || 0))
            .setPlaceholder('0-10')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(strikesInput));
        await interaction.showModal(modal);
        return;
    }

    // --- GESTIONAR STRIKES: Buscar equipo ---
    if (action === 'admin_manage_team_strikes') {
        const modal = new ModalBuilder()
            .setCustomId('admin_search_team_strikes_modal')
            .setTitle('Buscar Equipo para Strikes');

        const searchInput = new TextInputBuilder()
            .setCustomId('team_search')
            .setLabel('Nombre del equipo (o parte)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Real, City, United...')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
        await interaction.showModal(modal);
        return;
    }

    // --- USAR BOLSA EN TORNEO: Paso 1 - Seleccionar bolsa ---
    if (action === 'admin_pool_to_tournament') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const pools = await db.collection('team_pools').find({
            guildId: interaction.guildId,
            status: { $in: ['open', 'paused'] }
        }).toArray();

        if (pools.length === 0) {
            return interaction.editReply('❌ No hay bolsas activas. Crea una primero.');
        }

        const poolOptions = pools.filter(p => Object.keys(p.teams || {}).length > 0).map(p => ({
            label: `${p.name} (${Object.keys(p.teams || {}).length} equipos)`,
            description: `ID: ${p.shortId}`,
            value: p.shortId
        }));

        if (poolOptions.length === 0) {
            return interaction.editReply('❌ Todas las bolsas están vacías. Necesitas equipos inscritos.');
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_select_pool_for_tournament')
            .setPlaceholder('Selecciona la bolsa de origen')
            .addOptions(poolOptions.slice(0, 25));

        await interaction.editReply({
            content: '🎯 **Paso 1/3:** Selecciona la bolsa de la que quieres sacar equipos:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    // --- USAR BOLSA EN TORNEO: Paso 3 - Confirmar asignación ---
    if (action === 'admin_pool_assign_confirm') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [poolShortId, tournamentShortId, countStr] = params;
        const count = parseInt(countStr);

        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        if (!pool) return interaction.editReply('❌ Bolsa no encontrada.');

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('❌ Torneo no encontrado.');

        // Get top N teams by ELO
        const poolTeams = Object.values(pool.teams || {});
        poolTeams.sort((a, b) => b.elo - a.elo);
        const teamsToAssign = poolTeams.slice(0, count);

        if (teamsToAssign.length === 0) {
            return interaction.editReply('❌ No hay equipos disponibles en la bolsa.');
        }

        const { approveTeam, updatePublicMessages } = await import('../logic/tournamentLogic.js');

        let totalInscribed = 0;
        let errors = 0;
        let errorDetails = [];

        for (const poolTeam of teamsToAssign) {
            const captainId = poolTeam.managerId;

            // Check if already in tournament
            const alreadyIn =
                tournament.teams?.aprobados?.[captainId] ||
                tournament.teams?.pendientes?.[captainId];
            if (alreadyIn) {
                errorDetails.push(`${poolTeam.teamName}: ya está en el torneo`);
                errors++;
                continue;
            }

            const teamData = {
                id: captainId,
                nombre: poolTeam.teamName,
                eafcTeamName: '',
                capitanId: captainId,
                capitanTag: 'Bolsa_Inscripcion',
                coCaptainId: poolTeam.captains?.[0] || null,
                coCaptainTag: null,
                bandera: '🏳️',
                paypal: null,
                streamChannel: null,
                twitter: null,
                inscritoEn: new Date(),
                extraCaptains: (poolTeam.captains || []).filter(c => c !== captainId)
            };

            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.pendientes.${captainId}`]: teamData } }
            );

            let updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

            try {
                await approveTeam(client, updatedTournament, teamData);
                totalInscribed++;
            } catch (e) {
                console.error(`[Pool→Tournament] Error aprobando ${poolTeam.teamName}:`, e.message);
                errorDetails.push(`${poolTeam.teamName}: ${e.message}`);
                errors++;
            }
        }

        // Update tournament public messages
        const finalTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        await updatePublicMessages(client, finalTournament);

        // Remove assigned teams from pool + track usage
        const assignedManagers = [];
        const unsetFields = {};
        for (const poolTeam of teamsToAssign) {
            // Only remove if successfully inscribed (not errored)
            const wasError = errorDetails.some(e => e.startsWith(poolTeam.teamName));
            if (!wasError) {
                assignedManagers.push(poolTeam.managerId);
                unsetFields[`teams.${poolTeam.managerId}`] = '';
            }
        }

        if (assignedManagers.length > 0) {
            await db.collection('team_pools').updateOne(
                { shortId: poolShortId },
                {
                    $unset: unsetFields,
                    $set: { [`usedInTournaments.${tournamentShortId}`]: assignedManagers }
                }
            );
        }

        // Update pool embed
        const { createPoolEmbed } = await import('../utils/embeds.js');
        const updatedPool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        try {
            const channel = await client.channels.fetch(updatedPool.discordChannelId).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(updatedPool.discordMessageId).catch(() => null);
                if (msg) await msg.edit(createPoolEmbed(updatedPool));
            }
        } catch (e) { /* ignore */ }

        // Log to pool thread
        if (pool.logThreadId) {
            try {
                const thread = await client.channels.fetch(pool.logThreadId).catch(() => null);
                if (thread) {
                    await thread.send(
                        `🎯 **Asignación a torneo:** ${tournament.nombre}\n` +
                        `📊 Se asignaron **${totalInscribed}** de **${teamsToAssign.length}** equipos (top ELO)\n` +
                        `${errors > 0 ? `⚠️ Errores: ${errors}\n${errorDetails.join('\n')}` : ''}` +
                        `\nSolicitado por <@${interaction.user.id}>`
                    );
                }
            } catch (e) { /* ignore */ }
        }

        let response = `✅ **Asignación completada**\n` +
            `📦 Bolsa: **${pool.name}**\n` +
            `🏆 Torneo: **${tournament.nombre}**\n` +
            `✅ Inscritos: **${totalInscribed}**\n` +
            `❌ Errores: **${errors}**`;
        if (errorDetails.length > 0) {
            response += `\n\n**Detalle errores:**\n${errorDetails.join('\n')}`;
        }

        await interaction.editReply(response);
        return;
    }
    if (action === 'approve_paid_ealink') {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida. Solo para administradores.', flags: [MessageFlags.Ephemeral] });

        const [tournamentShortId, userId, eaClubId, eaPlatform] = params;
        const eaClubName = params.slice(4).join('_') || 'Desconocido';
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        if (!tournament) return interaction.reply({ content: 'El torneo ya no existe.', flags: [MessageFlags.Ephemeral] });

        // Update the user's team in pendingPayments or aprobados
        const updateQuery = {};
        if (tournament.teams?.pendingPayments?.[userId]) {
            updateQuery[`teams.pendingPayments.${userId}.eaClubId`] = eaClubId;
            updateQuery[`teams.pendingPayments.${userId}.eaClubName`] = eaClubName;
            updateQuery[`teams.pendingPayments.${userId}.eaPlatform`] = eaPlatform;
        } else if (tournament.teams?.aprobados?.[userId]) {
            updateQuery[`teams.aprobados.${userId}.eaClubId`] = eaClubId;
            updateQuery[`teams.aprobados.${userId}.eaClubName`] = eaClubName;
            updateQuery[`teams.aprobados.${userId}.eaPlatform`] = eaPlatform;
        } else {
            return interaction.reply({ content: 'El usuario ya no está inscrito en este torneo.', flags: [MessageFlags.Ephemeral] });
        }

        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $set: updateQuery }
        );

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('Green')
            .setTitle('✅ Vinculación con EA Aprobada (Torneo de Pago)');

        await interaction.update({ content: `Aprobado por <@${interaction.user.id}>`, embeds: [embed], components: [] });
        return;
    }

    if (action === 'reject_paid_ealink') {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida. Solo para administradores.', flags: [MessageFlags.Ephemeral] });

        const [userId] = params;

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('Red')
            .setTitle('❌ Vinculación con EA Rechazada (Torneo de Pago)');

        await interaction.update({ content: `Rechazado por <@${interaction.user.id}>`, embeds: [embed], components: [] });
        return;
    }

    if (action === 'approve_global_ealink') {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida. Solo para administradores.', flags: [MessageFlags.Ephemeral] });

        const [teamDbId, eaClubId, eaPlatform] = params;
        const eaClubName = params.slice(3).join('_') || 'Desconocido';
        const testDb = getDb('test');
        
        await testDb.collection('teams').updateOne(
            { _id: new ObjectId(teamDbId) },
            { $set: { eaClubId: eaClubId, eaPlatform: eaPlatform, eaClubName: eaClubName } }
        );

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('Green')
            .setTitle('✅ Vinculación con EA Aprobada (Global)');

        await interaction.update({ content: `Aprobado por <@${interaction.user.id}>`, embeds: [embed], components: [] });
        return;
    }

    if (action === 'reject_global_ealink') {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida. Solo para administradores.', flags: [MessageFlags.Ephemeral] });

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('Red')
            .setTitle('❌ Vinculación con EA Rechazada (Global)');

        await interaction.update({ content: `Rechazado por <@${interaction.user.id}>`, embeds: [embed], components: [] });
        return;
    }

    if (action === 'admin_generate_tournament_stats') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        if (!tournament) return interaction.reply({ content: 'El torneo no existe.', flags: [MessageFlags.Ephemeral] });

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            const { getTournamentPlayersStats, generateBest11Embed } = await import('../logic/statsLogic.js');
            
            const players = getTournamentPlayersStats(tournament);
            const embed = generateBest11Embed(tournament, players);

            // Intentar enviar al canal de logs (normalmente donde se anuncian partidos)
            let sent = false;
            if (tournament.discordMessageIds?.matchLogChannelId) {
                const channel = await client.channels.fetch(tournament.discordMessageIds.matchLogChannelId).catch(() => null);
                if (channel) {
                    await channel.send({ embeds: [embed] });
                    sent = true;
                }
            }

            if (!sent && tournament.discordMessageIds?.updateChannelId) {
                 const channel = await client.channels.fetch(tournament.discordMessageIds.updateChannelId).catch(() => null);
                 if (channel) {
                     await channel.send({ embeds: [embed] });
                     sent = true;
                 }
            }

            if (sent) {
                return interaction.editReply({ content: '✅ El reporte estadístico y el Mejor 11 se han generado y enviado al canal correspondiente.' });
            } else {
                return interaction.editReply({ content: '⚠️ Reporte generado, pero no se encontró un canal válido de actualizaciones o logs para enviarlo. Revisa la configuración del torneo.', embeds: [embed] });
            }

        } catch (error) {
            console.error('Error generando estadísticas de torneo:', error);
            return interaction.editReply({ content: '❌ Hubo un error al generar las estadísticas.' });
        }
    }

    if (action === 'team_link_ea_button') {
        const testDb = getDb('test');
        const userTeam = await testDb.collection('teams').findOne({
            guildId: guild.id,
            $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }]
        });
        if (!userTeam) return interaction.reply({ content: 'No se encontró tu equipo o no tienes permisos.', flags: [MessageFlags.Ephemeral] });

        const modal = new ModalBuilder()
            .setCustomId(`paid_link_ea_modal_:global`)
            .setTitle('Vincular con EA Sports');

        const eaNameInput = new TextInputBuilder()
            .setCustomId('ea_club_name')
            .setLabel("Nombre exacto de tu club en EA FC")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("Ej: Los Galacticos");

        const eaPlatformInput = new TextInputBuilder()
            .setCustomId('ea_platform')
            .setLabel("Consola (Nueva Gen o Antigua Gen)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue("Nueva Gen")
            .setPlaceholder("Escribe: Nueva Gen o Antigua Gen");

        modal.addComponents(
            new ActionRowBuilder().addComponents(eaNameInput),
            new ActionRowBuilder().addComponents(eaPlatformInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (action === 'paid_link_ea_start') {
        const [tournamentShortId] = params;
        const modal = new ModalBuilder()
            .setCustomId(`paid_link_ea_modal_:${tournamentShortId}`)
            .setTitle('Vincular con EA Sports (Evento)');

        const eaNameInput = new TextInputBuilder()
            .setCustomId('ea_club_name')
            .setLabel("Nombre exacto de tu club en EA FC")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const eaPlatformInput = new TextInputBuilder()
            .setCustomId('ea_platform')
            .setLabel("Plataforma (Nueva Generación o Antigua)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ej: Nueva Generacion, Antigua, PS4, PC")
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(eaNameInput),
            new ActionRowBuilder().addComponents(eaPlatformInput)
        );

        await interaction.showModal(modal);
        return;
    }
}

// =======================================================
// --- FUNCIÓN AUXILIAR: CONSTRUCTOR DE JORNADAS ---
// =======================================================

export function buildLeagueConstructorMessage(tournament) {
    const builder = tournament.temp.leagueBuilder;
    const currentJornada = builder.currentJornada;
    const totalJornadas = builder.totalJornadas;
    const jornada = builder.jornadas[currentJornada] || [];
    const allTeams = Object.values(tournament.teams.aprobados).filter(t => t && t.id);

    // Equipos ya emparejados en esta jornada
    const pairedTeamIds = new Set();
    jornada.forEach(pair => {
        if (pair.equipoA && pair.equipoA.id !== 'ghost') pairedTeamIds.add(pair.equipoA.id);
        if (pair.equipoB && pair.equipoB.id !== 'ghost') pairedTeamIds.add(pair.equipoB.id);
    });

    const availableTeams = allTeams.filter(t => !pairedTeamIds.has(t.id));

    // --- Construir descripción del embed ---
    let description = '';

    // Estado del modo actual
    if (builder.byeMode) {
        description += '💤 **MODO DESCANSO**: Selecciona el equipo que descansará en esta jornada.\n\n';
    } else if (builder.pendingTeamA) {
        const pendingTeam = allTeams.find(t => t.id === builder.pendingTeamA);
        description += `🏠 **Local seleccionado:** ${pendingTeam?.nombre || '?'}\n*Selecciona el equipo visitante...*\n\n`;
    }

    // Enfrentamientos creados en esta jornada
    if (jornada.length > 0) {
        description += '📋 **Enfrentamientos:**\n';
        jornada.forEach((pair, i) => {
            if (pair.equipoB && pair.equipoB.id === 'ghost') {
                description += `${i + 1}. 💤 ${pair.equipoA?.nombre || '?'} — **DESCANSO**\n`;
            } else if (pair.equipoA && pair.equipoA.id === 'ghost') {
                description += `${i + 1}. 💤 ${pair.equipoB?.nombre || '?'} — **DESCANSO**\n`;
            } else {
                description += `${i + 1}. ⚔️ ${pair.equipoA?.nombre || '?'} vs ${pair.equipoB?.nombre || '?'}\n`;
            }
        });
    } else {
        description += '*No hay enfrentamientos en esta jornada.*\n';
    }

    // Equipos sin emparejar
    if (availableTeams.length > 0 && !builder.pendingTeamA && !builder.byeMode) {
        const teamNames = availableTeams.map(t => t.nombre).join(', ');
        if (teamNames.length > 800) {
            description += `\n⏳ **Sin emparejar (${availableTeams.length}):** _Demasiados para listar_`;
        } else {
            description += `\n⏳ **Sin emparejar (${availableTeams.length}):** ${teamNames}`;
        }
    }

    // Progreso global
    const expectedMatches = Math.floor(allTeams.length / 2);
    let completedJornadas = 0;
    for (let j = 1; j <= totalJornadas; j++) {
        const jp = builder.jornadas[j] || [];
        if (jp.length >= expectedMatches) completedJornadas++;
    }
    description += `\n\n📊 **Progreso:** ${completedJornadas}/${totalJornadas} jornadas completas`;

    const embed = new EmbedBuilder()
        .setTitle('🛠️ Constructor de Jornadas (Manual)')
        .setDescription(description)
        .setColor(builder.byeMode ? '#e67e22' : builder.pendingTeamA ? '#f1c40f' : '#2ECC71')
        .setFooter({ text: `📅 Jornada ${currentJornada} de ${totalJornadas} | ${availableTeams.length} equipos disponibles | ${allTeams.length} total` });

    // --- Construir componentes ---
    const components = [];

    // Row 1: Select menu (si hay equipos disponibles)
    if (availableTeams.length > 0) {
        const page = builder.page || 0;
        const pageSize = 24;
        const startIdx = page * pageSize;
        const pageTeams = availableTeams.slice(startIdx, startIdx + pageSize);

        if (pageTeams.length > 0) {
            let placeholder;
            if (builder.byeMode) {
                placeholder = '💤 Elige equipo que descansa';
            } else if (builder.pendingTeamA) {
                placeholder = '👉 Elige Equipo Visitante';
            } else {
                placeholder = '👉 Elige Equipo Local';
            }

            const options = pageTeams.map(t => ({
                label: t.nombre.substring(0, 100),
                value: t.id
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`league_builder_select:${tournament.shortId}`)
                .setPlaceholder(placeholder)
                .addOptions(options);

            components.push(new ActionRowBuilder().addComponents(selectMenu));

            // Row 2: Paginación (si hay más de pageSize equipos)
            const totalPages = Math.ceil(availableTeams.length / pageSize);
            if (totalPages > 1) {
                const pageRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`league_builder_page_prev:${tournament.shortId}`)
                        .setLabel('◀️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId(`league_builder_page_info:${tournament.shortId}`)
                        .setLabel(`Pág ${page + 1}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`league_builder_page_next:${tournament.shortId}`)
                        .setLabel('▶️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page >= totalPages - 1)
                );
                components.push(pageRow);
            }
        }
    }

    // Row 3: Acciones (Deshacer + Descanso)
    const isOddTeams = allTeams.length % 2 !== 0;
    const byeAlreadyAssigned = jornada.some(p => (p.equipoA?.id === 'ghost' || p.equipoB?.id === 'ghost'));

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`league_builder_undo:${tournament.shortId}`)
            .setLabel('🗑️ Deshacer')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(jornada.length === 0 && !builder.pendingTeamA && !builder.byeMode),
        new ButtonBuilder()
            .setCustomId(`league_builder_bye:${tournament.shortId}`)
            .setLabel('💤 Descanso')
            .setStyle(builder.byeMode ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(!isOddTeams || byeAlreadyAssigned || builder.pendingTeamA !== null || availableTeams.length === 0)
    );
    components.push(actionRow);

    // Row 4: Navegación + Confirmar
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`league_builder_prev:${tournament.shortId}`)
            .setLabel('⏮️ Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentJornada <= 1),
        new ButtonBuilder()
            .setCustomId(`league_builder_info:${tournament.shortId}`)
            .setLabel(`📍 Jornada ${currentJornada}/${totalJornadas}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`league_builder_next:${tournament.shortId}`)
            .setLabel('⏭️ Siguiente')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentJornada >= totalJornadas),
        new ButtonBuilder()
            .setCustomId(`league_builder_confirm:${tournament.shortId}`)
            .setLabel('✅ Confirmar Todo')
            .setStyle(ButtonStyle.Success)
    );
    components.push(navRow);

    return { embeds: [embed], components };
}
