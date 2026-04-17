// --- INICIO DEL ARCHIVO modalHandler.js (VERSIÓN FINAL, COMPLETA Y CORREGIDA) ---

import { ObjectId } from 'mongodb';
import { getDb, updateBotSettings, getBotSettings } from '../../database.js';
// --- CÓDIGO MODIFICADO Y CORRECTO ---
import { createNewTournament, updateTournamentConfig, updatePublicMessages, forceResetAllTournaments, addTeamToWaitlist, notifyCastersOfNewTeam, createNewDraft, approveDraftCaptain, updateDraftMainInterface, requestStrike, requestPlayerKick, notifyTournamentVisualizer, notifyVisualizer, createTournamentFromDraft, handleImportedPlayers, addSinglePlayerToDraft, sendPaymentApprovalRequest, adminAddPlayerToDraft } from '../logic/tournamentLogic.js';
import { processVerification, processProfileUpdate } from '../logic/verificationLogic.js';
import { processMatchResult, findMatch, findMatchPath, finalizeMatchThread } from '../logic/matchLogic.js';
// --- LÍNEA CORREGIDA Y COMPLETA ---
import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, StringSelectMenuBuilder, ChannelType, PermissionsBitField, TextInputBuilder, TextInputStyle, ModalBuilder, AttachmentBuilder } from 'discord.js';
import * as xlsx from 'xlsx';
import { CHANNELS, ARBITRO_ROLE_ID, PAYMENT_CONFIG, DRAFT_POSITIONS, ADMIN_APPROVAL_CHANNEL_ID, VERIFICATION_TICKET_CATEGORY_ID } from '../../config.js';
import { getLeagueByElo, LEAGUE_EMOJIS } from '../logic/eloLogic.js';
import { updateTournamentManagementThread, updateDraftManagementPanel } from '../utils/panelManager.js';
import { createDraftStatusEmbed, createPoolEmbed } from '../utils/embeds.js';
import { parseExternalDraftWhatsappList } from '../utils/textParser.js';
import { parseWhatsAppList, matchTeamsToDatabase, distributeByElo } from '../logic/whatsappDistributor.js';
import { generateExcelImage } from '../utils/twitter.js';
import { scheduleRegistrationListUpdate } from '../utils/registrationListManager.js';


export async function handleModal(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    const [action, ...params] = customId.split(':');

    // =======================================================
    // --- LÓGICA DE VERIFICACIÓN Y GESTIÓN DE PERFIL ---
    // =======================================================

    if (action === 'verify_submit_data') {
        return interaction.reply({ content: 'Esta función ha sido actualizada. Por favor, reinicia el proceso de verificación.', flags: [MessageFlags.Ephemeral] });
    }

    if (action === 'verification_ticket_submit') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // --- CORRECCIÓN 1: CAPTURAR EL draftShortId ---
        const [platform, draftShortId] = params;
        const gameId = interaction.fields.getTextInputValue('game_id_input').trim();
        const twitter = interaction.fields.getTextInputValue('twitter_input').trim();
        const whatsapp = interaction.fields.getTextInputValue('whatsapp_input').trim();

        // El campo de confirmación de WhatsApp puede no existir en todas las versiones del modal
        let whatsappConfirm = whatsapp; // Por defecto, sin confirmación = aceptar
        try {
            whatsappConfirm = interaction.fields.getTextInputValue('whatsapp_confirm_input').trim();
        } catch (e) {
            // Campo no incluido en esta versión del modal, se omite la validación
        }

        if (whatsapp !== whatsappConfirm) {
            return interaction.editReply({ content: '❌ **Error:** Los números de WhatsApp no coinciden. Por favor, inténtalo de nuevo.' });
        }

        const user = interaction.user;
        const guild = interaction.guild;

        const existingTicket = await db.collection('verificationtickets').findOne({ userId: user.id, status: { $in: ['pending', 'claimed'] } });
        if (existingTicket) {
            const channel = await guild.channels.fetch(existingTicket.channelId).catch(() => null);
            if (channel) {
                return interaction.editReply({ content: `❌ Ya tienes un ticket de verificación abierto aquí: ${channel.toString()}` });
            } else {
                console.warn(`[TICKET ATASCADO] El usuario ${user.tag} tiene un ticket (${existingTicket._id}) apuntando a un canal borrado.`);
                return interaction.editReply({ content: `❌ **Error:** Detectamos una solicitud de verificación anterior que no se cerró correctamente. Por favor, contacta con un administrador.` });
            }
        }

        try {
            const ticketChannel = await guild.channels.create({
                name: `verificacion-${user.username}`,
                type: ChannelType.GuildText,
                parent: VERIFICATION_TICKET_CATEGORY_ID,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                ],
                reason: `Ticket de verificación para ${user.tag}`
            });

            const adminApprovalChannel = await guild.channels.fetch(ADMIN_APPROVAL_CHANNEL_ID).catch(() => null);
            let adminNotificationMessageId = null;

            if (adminApprovalChannel) {
                const adminNotificationEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('🔎 Nueva Solicitud de Verificación Pendiente').setDescription(`El usuario <@${user.id}> ha abierto un ticket.`).addFields({ name: 'Usuario', value: user.tag, inline: true }, { name: 'Plataforma', value: platform.toUpperCase(), inline: true });
                const goToChannelButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ir al Ticket').setStyle(ButtonStyle.Link).setURL(ticketChannel.url));
                const adminMessage = await adminApprovalChannel.send({ embeds: [adminNotificationEmbed], components: [goToChannelButton] });
                adminNotificationMessageId = adminMessage.id;
            }

            const summaryEmbedInTicket = new EmbedBuilder().setColor('#f1c40f').setTitle('🔎 Nueva Solicitud de Verificación').addFields({ name: 'Usuario', value: `<@${user.id}> (${user.tag})`, inline: false }, { name: 'Plataforma', value: platform.toUpperCase(), inline: true }, { name: 'ID de Juego', value: `\`${gameId}\``, inline: true }, { name: 'Twitter', value: `\`${twitter}\``, inline: true }, { name: 'WhatsApp', value: `\`${whatsapp}\``, inline: true });
            const claimButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`claim_verification_ticket:${ticketChannel.id}`).setLabel('Reclamar Ticket').setStyle(ButtonStyle.Primary));
            await ticketChannel.send({ embeds: [summaryEmbedInTicket], components: [claimButton] });

            const uniqueCode = `${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            const instructionsEmbed = new EmbedBuilder().setColor('#3498db').setTitle('¡Bienvenido a tu Canal de Verificación!').setDescription(`Tu **código de verificación único** es: **\`${uniqueCode}\`**\n\nPor favor, edita la biografía/estado de tu perfil en **${platform.toUpperCase()}** para que contenga este código. Luego, envía una **captura de pantalla completa** en este canal donde se vea claramente tu **ID de Juego** y el **código**.`);
            await ticketChannel.send({ content: `<@${user.id}>`, embeds: [instructionsEmbed] });

            // --- CORRECCIÓN 2: GUARDAR EL draftShortId ---
            await db.collection('verificationtickets').insertOne({
                userId: user.id, guildId: guild.id, channelId: ticketChannel.id,
                platform, gameId, twitter, whatsapp, uniqueCode, status: 'pending',
                claimedBy: null, createdAt: new Date(), adminNotificationMessageId,
                draftShortId: draftShortId || null
            });

            await interaction.editReply({ content: `✅ ¡Perfecto! Hemos creado un canal privado para ti. Por favor, continúa aquí: ${ticketChannel.toString()}` });
        } catch (error) {
            console.error("Error al crear el canal de verificación:", error);
            await interaction.editReply({ content: '❌ Hubo un error al crear tu canal de verificación. Asegúrate de que el bot tiene permisos.' });
        }
        return;
    }
    if (action === 'update_profile_submit_new_value') {
        await processProfileUpdate(interaction);
        return;
    }

    if (action === 'promo_image_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const imageUrl = interaction.fields.getTextInputValue('promo_image_url').trim();

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: '❌ Torneo no encontrado.' });

        if (imageUrl !== '' && !/^https?:\/\/.+/.test(imageUrl)) {
             return interaction.editReply({ content: '❌ La URL debe empezar por http:// o https://' });
        }

        const finalUrl = imageUrl === '' ? null : imageUrl;

        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            { $set: { 'config.promoImage': finalUrl } }
        );

        tournament.config.promoImage = finalUrl;

        try {
            const { updatePublicMessages } = await import('../logic/tournamentLogic.js');
            const { notifyTournamentVisualizer } = await import('../logic/tournamentLogic.js');
            await updatePublicMessages(client, tournament);
            await notifyTournamentVisualizer(tournament);
        } catch (e) {
            console.error("Error al actualizar la imagen en los mensajes públicos:", e);
        }

        await interaction.editReply({ content: `✅ Imagen promocional actualizada correctamente.` });
        return;
    }

    if (action === 'rules_link_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const rulesUrl = interaction.fields.getTextInputValue('rules_url').trim();

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: '❌ Torneo no encontrado.' });

        if (rulesUrl !== '' && !/^https?:\/\/.+/.test(rulesUrl)) {
             return interaction.editReply({ content: '❌ La URL debe empezar por http:// o https://' });
        }

        const finalUrl = rulesUrl === '' ? null : rulesUrl;

        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            { $set: { 'config.customRulesUrl': finalUrl } }
        );

        tournament.config.customRulesUrl = finalUrl;

        try {
            const { updatePublicMessages } = await import('../logic/tournamentLogic.js');
            await updatePublicMessages(client, tournament);
        } catch (e) {
            console.error("Error al actualizar la URL local de normas:", e);
        }

        await interaction.editReply({ content: `✅ URL de normativas ${finalUrl ? 'personalizada' : 'borrada, ahora usa la global'} correctamente.` });
        return;
    }

    // =======================================================
    // --- LÓGICA DE INSCRIPCIÓN MANUAL (ADMIN) ---
    // =======================================================

    if (action === 'admin_manual_register_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, userId] = params;

        const teamName = interaction.fields.getTextInputValue('team_name_input');
        const streamChannel = interaction.fields.getTextInputValue('stream_input') || null;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('❌ Torneo no encontrado.');

        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) return interaction.editReply('❌ Usuario no encontrado.');

        // Construimos el objeto de equipo
        const teamData = {
            id: userId,
            nombre: teamName,
            eafcTeamName: teamName,
            capitanId: userId,
            capitanTag: user.tag,
            coCaptainId: null,
            coCaptainTag: null,
            logoUrl: user.displayAvatarURL(),
            twitter: null,
            streamChannel: streamChannel,
            paypal: null, // Ya no pedimos referencia de pago en inscripción manual
            inscritoEn: new Date(),
            isPaid: true,
            isManualRegistration: true
        };

        try {
            // Usamos approveTeam para gestionar la entrada oficial
            const { approveTeam } = await import('../logic/tournamentLogic.js');
            await approveTeam(client, tournament, teamData);

            // FIX: DAR PERMISO VOZ CANAL B (igual que en admin_approve)
            if (tournament.config?.isPaid && tournament.discordMessageIds?.capitanesAprobadosVoiceId) {
                client.channels.fetch(tournament.discordMessageIds.capitanesAprobadosVoiceId).then(vc => {
                    if (vc) vc.permissionOverwrites.create(userId, { ViewChannel: true, Connect: true, Speak: true })
                            .catch(e => console.error('[VOZ] Error Canal B manual:', e));
                }).catch(() => {});
            }

            await interaction.editReply({ content: `✅ **Inscripción Manual Completada**\nEl equipo **${teamName}** (Capitán: ${user.tag}) ha sido inscrito en el torneo y se le han asignado los permisos de voz correspondientes si es de pago.` });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Error al inscribir: ${error.message}` });
        }
        return;
    }

    // =======================================================
    // --- LÓGICA ORIGINAL DEL BOT (CON CORRECCIONES DE FLAGS) ---
    // =======================================================

    // --- FIX: Handler para el modal de convertir a liguilla flexible ---
    if (action === 'edit_tournament_to_flexible') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: '❌ Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });

        let qualifiers = 0;
        try {
            qualifiers = parseInt(interaction.fields.getTextInputValue('torneo_qualifiers')) || 0;
        } catch (e) { }

        // Mantenemos guardado temporalmente la config para el siguiente paso (elegir el modo liguilla)
        const pendingId = `pending_edit_${tournamentShortId}_${Date.now()}`;
        await db.collection('pending_tournaments').insertOne({
            pendingId,
            action: 'edit_format',
            targetTournamentShortId: tournamentShortId,
            newFormatId: 'flexible_league',
            qualifiers: qualifiers,
            createdAt: new Date()
        });

        // Exactamente los mismos botones que en create_tournament
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`create_flexible_league_mode:swiss:${pendingId}`)
                .setLabel('Sistema Suizo')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`create_flexible_league_mode:round_robin:${pendingId}`)
                .setLabel('Todos contra Todos')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`create_flexible_league_mode:custom_league:${pendingId}`)
                .setLabel('Liga Personalizada')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.reply({
            content: `Has seleccionado **Liguilla Flexible** con **${qualifiers} clasificados**.\n\nAhora elige el modo de enfrentamientos definitivos:`,
            components: [row]
        });
        return;
    }
    // --- FIN FIX ---

    // =======================================================
    // --- LÓGICA DE DRAFT EXTERNO JUGADORES (DISCORD NATIVO) ---
    // =======================================================
    if (action === 'ext_reg_player_modal') {
        const [tournamentShortId, position] = params;
        const gameId = interaction.fields.getTextInputValue('gameIdInput').trim();
        const whatsappNumber = interaction.fields.getTextInputValue('whatsappInput').replace(/\s+/g, '');

        if (!/^\+?[0-9]{8,15}$/.test(whatsappNumber)) {
            return interaction.reply({ content: '❌ Número de WhatsApp inválido. Asegúrate de incluir el prefijo (ej: +34) y que no tenga espacios.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const safeGameId = gameId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingGameId = await db.collection('external_draft_registrations').findOne({
            tournamentId: tournamentShortId,
            gameId: new RegExp(`^${safeGameId}$`, 'i'),
            userId: { $ne: interaction.user.id }
        });

        if (existingGameId) {
            return interaction.editReply('❌ **Ese ID en el juego ya está registrado** por otro usuario.');
        }

        const existingWhatsapp = await db.collection('external_draft_registrations').findOne({
            tournamentId: tournamentShortId,
            whatsapp: whatsappNumber,
            userId: { $ne: interaction.user.id }
        });

        if (existingWhatsapp) {
            return interaction.editReply('❌ **Ese número de WhatsApp ya está registrado** por otro usuario.');
        }

        const registrationData = {
            tournamentId: tournamentShortId,
            userId: interaction.user.id,
            discordId: interaction.user.id,
            discordUsername: interaction.user.tag,
            gameId: gameId,
            whatsapp: whatsappNumber,
            position: position,
            timestamp: new Date()
        };

        const existingReg = await db.collection('external_draft_registrations').findOne({
            tournamentId: tournamentShortId,
            $or: [{ userId: interaction.user.id }, { discordId: interaction.user.id }]
        });

        let isUpdate = false;
        if (existingReg) {
            await db.collection('external_draft_registrations').updateOne(
                { _id: existingReg._id },
                { $set: registrationData }
            );
            isUpdate = true;
        } else {
            await db.collection('external_draft_registrations').insertOne(registrationData);
        }

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (tournament && tournament.registrationLogThreadId) {
            const logChannel = await client.channels.fetch(tournament.registrationLogThreadId).catch(() => null);
            if (logChannel) {
                // Generar estadísticas agregadas idénticas a la web
                const pipeline = [
                    { $match: { tournamentId: tournamentShortId } },
                    { $group: { _id: '$position', count: { $sum: 1 } } }
                ];
                const statsArray = await db.collection('external_draft_registrations').aggregate(pipeline).toArray();
                const stats = { GK: 0, DFC: 0, CARR: 0, MC: 0, DC: 0 };
                statsArray.forEach(r => { if (stats.hasOwnProperty(r._id)) stats[r._id] = r.count; });
                const total = Object.values(stats).reduce((a, b) => a + b, 0);

                const posNames = { GK: 'Portero', DFC: 'Defensa', CARR: 'Carrilero', MC: 'Medio', DC: 'Delantero' };
                const posName = posNames[position] || position;
                
                const statsLine = `📊 Total: ${total} inscritos (${stats.GK} POR · ${stats.DFC} DFC · ${stats.CARR} CARR · ${stats.MC} MC · ${stats.DC} DC)`;
                
                if (isUpdate) {
                    await logChannel.send(`✏️ **${interaction.user.tag}** ha modificado su posición a **${posName}**\n${statsLine}`);
                } else {
                    await logChannel.send(`✅ **${interaction.user.tag}** se ha inscrito como **${posName}** — ID: \`${gameId}\`\n${statsLine}`);
                }
            }
        }

        const replyMsg = isUpdate
            ? `✅ **Inscripción actualizada.** Tu posición ahora es **${position}** y tu ID es **${gameId}**.`
            : `✅ **¡Inscripción completada!** Te has registrado como **${position}** en el draft.\n\nPuedes volver a pulsar el botón de Inscribirme si necesitas modificar tus datos o darte de baja.`;

        // Hook: actualizar canal de lista de inscritos
        scheduleRegistrationListUpdate(client, tournamentShortId);

        return interaction.editReply(replyMsg);
    }

    if (action === 'ext_reg_admin_add_submit') {
        const [tournamentShortId, targetUserId] = params;
        const gameId = interaction.fields.getTextInputValue('admin_add_gameId').trim();
        const whatsappNumber = interaction.fields.getTextInputValue('admin_add_whatsapp').replace(/\s+/g, '');
        let position = interaction.fields.getTextInputValue('admin_add_position').trim().toUpperCase();

        const validPositions = ['GK', 'DFC', 'CARR', 'MC', 'DC'];
        if (!validPositions.includes(position)) {
            // Unify names to specific ones if they write others
            if (['PORTERO', 'POR'].includes(position)) position = 'GK';
            else if (['DEF', 'CENTRAL'].includes(position)) position = 'DFC';
            else if (['LAT', 'LATERAL'].includes(position)) position = 'CARR';
            else if (['MEDIO', 'MCD', 'MCO'].includes(position)) position = 'MC';
            else if (['DEL', 'DELANTERO', 'EI', 'ED'].includes(position)) position = 'DC';
            else return interaction.reply({ content: '❌ Posición inválida. Debe ser GK, DFC, CARR, MC o DC.', flags: [MessageFlags.Ephemeral] });
        }

        if (!/^\+?[0-9]{8,15}$/.test(whatsappNumber)) {
            return interaction.reply({ content: '❌ Número de WhatsApp inválido.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const safeGameId = gameId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingGameId = await db.collection('external_draft_registrations').findOne({
            tournamentId: tournamentShortId,
            gameId: new RegExp(`^${safeGameId}$`, 'i'),
            userId: { $ne: targetUserId }
        });

        if (existingGameId) {
            return interaction.editReply('❌ **Ese ID en el juego ya está registrado** por otro usuario.');
        }

        const existingWhatsapp = await db.collection('external_draft_registrations').findOne({
            tournamentId: tournamentShortId,
            whatsapp: whatsappNumber,
            userId: { $ne: targetUserId }
        });

        if (existingWhatsapp) {
            return interaction.editReply('❌ Ese número de teléfono ya está registrado en este torneo.');
        }

        // Obtener el tag del usuario para los registros (hacemos un fetch por si no está cacheado)
        let targetUserTag = 'UsuarioManual';
        try {
            const fetchedUser = await client.users.fetch(targetUserId);
            if (fetchedUser) targetUserTag = fetchedUser.tag;
        } catch (e) { }

        const data = {
            tournamentId: tournamentShortId,
            userId: targetUserId,
            discordTag: targetUserTag,
            gameId: gameId,
            whatsapp: whatsappNumber,
            position: position,
            registeredAt: new Date(),
            manuallyAdded: true
        };

        const result = await db.collection('external_draft_registrations').updateOne(
            { tournamentId: tournamentShortId, userId: targetUserId },
            { $set: data },
            { upsert: true }
        );

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (tournament && tournament.registrationLogThreadId) {
            const logChannel = await client.channels.fetch(tournament.registrationLogThreadId).catch(() => null);
            if (logChannel) {
                await logChannel.send(`🧲 **INSCRIPCIÓN MANUAL (Admin):** <@${targetUserId}> (${gameId}) ha sido inscrito forzosamente como **${position}** por <@${interaction.user.id}>.`);
            }
        }

        await interaction.editReply(`✅ **Inscripción completada.** <@${targetUserId}> ahora es **${position}**.`);

        // Hook: actualizar canal de lista de inscritos
        scheduleRegistrationListUpdate(client, tournamentShortId);

        return;
    }

    // =======================================================
    // --- LÓGICA DE DRAFT EXTERNO y CUP (CAPITANES MODAL) ---
    // =======================================================
    if (action === 'register_paid_team_modal') {
        const [tournamentShortId] = params;
        const managerId = interaction.user.id;
        const whatsappNumber = interaction.fields.getTextInputValue('whatsapp_input');

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.reply({ content: '❌ El torneo no existe.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // Auto-generar nombre de equipo igual que Cash Cup
        const rawName = interaction.member.displayName || interaction.user.username;
        const sanitizedName = rawName.replace(/[^\p{L}\p{N}\s\-]/gu, '').trim().substring(0, 20) || interaction.user.username.substring(0, 20);
        const autoTeamName = `TEAM ${sanitizedName}`;

        const teamData = {
            id: managerId,
            nombre: autoTeamName,
            eafcTeamName: autoTeamName,
            capitanId: managerId,
            capitanTag: interaction.user.tag,
            coCaptainId: null,
            coCaptainTag: null,
            logoUrl: interaction.user.displayAvatarURL(),
            twitter: '',
            streamChannel: '',
            paypal: null,
            whatsapp: whatsappNumber, // Guardamos WhatsApp extraído del modal
            inscritoEn: new Date(),
            isPaid: true
        };

        try {
            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.pendingPayments.${managerId}`]: teamData } }
            );

            // Importación dinámica limpia
            const { sendPaymentApprovalRequest } = await import('../logic/tournamentLogic.js');

            // Enviar solicitud background al admin
            sendPaymentApprovalRequest(client, tournament, teamData, interaction.user).catch(err => {
                console.error('[PAID REG] Error enviando solicitud al admin:', err);
            });

            const isDraft = tournament.config.paidSubType === 'draft';

            // Mensaje confirmación
            if (isDraft) {
                // Otorgar permisos al canal A de voz solo si es draft
                const seleccionVoiceId = tournament.discordMessageIds?.seleccionCapitanesVoiceId;
                if (seleccionVoiceId) {
                    client.channels.fetch(seleccionVoiceId).then(voiceChannel => {
                        if (voiceChannel) {
                            voiceChannel.permissionOverwrites.create(managerId, {
                                ViewChannel: true, Connect: true, Speak: true
                            }).catch(err => console.error('[VOZ] Error dando permiso Canal Draft:', err));
                        }
                    }).catch(() => { });
                }

                const canalMention = seleccionVoiceId ? `<#${seleccionVoiceId}>` : 'el canal de selección';
                await interaction.editReply({
                    content: `✅ Solicitud enviada.\nUn administrador revisará la inscripción y te contactará.\nMientras tanto, puedes acceder a ${canalMention} para hablar con otros capitanes pendientes y ver el stream de selección.`
                });
            } else {
                // Mensaje simplificado para Cash Cups
                await interaction.editReply({
                    content: `✅ Has mandado solicitud para participar en la modalidad de pago. Espera respuesta en tu DM sobre si Administración te aprueba o rechaza.`
                });
            }

        } catch (error) {
            console.error('[DRAFT REG] Error:', error);
            await interaction.editReply({ content: '❌ Hubo un error procesando tu inscripción al Draft Externo.' });
        }
        return;
    }

    if (action === 'inscripcion_final_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const [tournamentShortId, platform, teamId] = params;
        const streamUsername = interaction.fields.getTextInputValue('stream_username_input');
        const streamChannelUrl = platform === 'twitch' ? `https://twitch.tv/${streamUsername}` : `https://youtube.com/@${streamUsername}`;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });



        // --- LÓGICA TORNEO DE PAGO ---
        if (tournament.config.isPaid) {
            // En torneos de pago, IGNORAMOS si es manager o no. Cualquiera puede inscribir un equipo "custom".
            // Usamos el teamId como "nombre del equipo" si viene de un input de texto, o si viene del select, lo buscamos.
            // Pero espera, el modal anterior venía de un select de equipos o de un botón?
            // En el flujo actual, el usuario selecciona equipo del select menu.
            // Para torneos de pago, deberíamos haber permitido escribir el nombre.
            // ASUMIMOS que si es de pago, el 'teamId' puede ser un string arbitrario o un ID.
            // Pero para no romper el flujo actual, vamos a usar el equipo seleccionado SI existe,
            // y si no (porque permitimos custom), usamos el input.
            // POR AHORA: Usamos la lógica de "Equipo Temporal" basada en el equipo seleccionado,
            // pero sin validar que sea EL manager oficial (permitimos a cualquiera).

            let teamName = "Equipo Sin Nombre";
            let teamLogo = "https://i.imgur.com/2ecc71.png"; // Placeholder
            let teamTwitter = "";

            if (ObjectId.isValid(teamId)) {
                const team = await getDb('test').collection('teams').findOne({ _id: new ObjectId(teamId) });
                if (team) {
                    teamName = team.name;
                    teamLogo = team.logoUrl;
                    teamTwitter = team.twitterHandle;
                }
            } else {
                // Fallback si pasamos el nombre directamente en vez del ID (futura mejora)
                teamName = "Equipo de " + interaction.user.username;
            }

            const pendingPaymentData = {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                teamName: teamName,
                eafcTeamName: teamName, // Asumimos mismo nombre
                logoUrl: teamLogo,
                twitter: teamTwitter,
                streamChannel: streamChannelUrl,
                platform: platform,
                registeredAt: new Date()
            };

            // Guardamos en una colección temporal o campo temporal dentro del torneo
            if (!tournament.teams.pendingPayments) tournament.teams.pendingPayments = {};

            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.pendingPayments.${interaction.user.id}`]: pendingPaymentData } }
            );

            // Enviar DM con información de pago
            const paymentEmbed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTitle(`💸 Pago Requerido: ${tournament.nombre}`)
                .setDescription(`Has iniciado la inscripción para el equipo **${teamName}**.\n\n**Cuota de Inscripción:** ${tournament.config.entryFee}€\n\n**Métodos de Pago:**\nPayPal: \`${tournament.config.paypalEmail || 'No configurado'}\`\nBizum: \`${tournament.config.bizumNumber || 'No configurado'}\`\n\nRealiza el pago y luego pulsa el botón de abajo para notificar a los administradores.`)
                .setFooter({ text: 'Tu plaza no está reservada hasta que se verifique el pago.' });

            const confirmButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`payment_confirm_start:${tournament.shortId}`)
                    .setLabel('✅ He Realizado el Pago')
                    .setStyle(ButtonStyle.Success)
            );

            try {
                await interaction.user.send({ embeds: [paymentEmbed], components: [confirmButton] });
                await interaction.editReply({ content: `✅ **Pre-inscripción recibida.** Te hemos enviado un MD con los datos de pago. Revisa tus mensajes privados.` });
            } catch (e) {
                await interaction.editReply({ content: `❌ No pudimos enviarte el MD con los datos de pago. Por favor, abre tus mensajes directos y vuelve a intentarlo.` });
            }
            return;
        }
        // --- FIN LÓGICA TORNEO DE PAGO ---

        const team = await getDb('test').collection('teams').findOne({ _id: new ObjectId(teamId) });

        if (!tournament || !team) {
            return interaction.editReply({ content: '❌ El torneo o el equipo ya no existen.' });
        }

        const teamData = {
            id: team.managerId,
            nombre: team.name,
            eafcTeamName: team.name,
            capitanId: team.managerId,
            capitanTag: interaction.user.tag,
            coCaptainId: team.captains.length > 0 ? team.captains[0] : null,
            coCaptainTag: null,
            logoUrl: team.logoUrl,
            twitter: team.twitterHandle,
            streamChannel: streamChannelUrl,
            paypal: null,
            inscritoEn: new Date()
        };

        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { [`teams.pendientes.${teamData.capitanId}`]: teamData } });

        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId);

        const adminEmbed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle(`🔔 Nueva Inscripción (Equipo Registrado)`)
            .setThumbnail(teamData.logoUrl)
            .addFields(
                { name: 'Equipo', value: teamData.nombre, inline: true },
                { name: 'Mánager', value: interaction.user.tag, inline: true },
                { name: 'Canal de Stream', value: `[Ver Canal](${teamData.streamChannel})`, inline: false }
            );
        const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_approve:${teamData.capitanId}:${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin_reject:${teamData.capitanId}:${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });

        await interaction.editReply({ content: `✅ ¡Tu inscripción para **${team.name}** ha sido recibida! Un admin la revisará pronto.` });
        return;
    }

    if (action === 'admin_manual_result_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, matchId] = params;
        const homeGoals = parseInt(interaction.fields.getTextInputValue('home_goals'));
        const awayGoals = parseInt(interaction.fields.getTextInputValue('away_goals'));

        if (isNaN(homeGoals) || isNaN(awayGoals) || homeGoals < 0 || awayGoals < 0) {
            return interaction.editReply({ content: '❌ Los goles deben ser números válidos y no negativos.' });
        }

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.editReply({ content: '❌ Torneo no encontrado.' });
        }

        try {
            const resultString = `${homeGoals}-${awayGoals}`;
            await processMatchResult(client, guild, tournament, matchId, resultString);

            // Try to find the match to get team names for the confirmation message
            // Note: processMatchResult might have updated the tournament structure in DB, 
            // but we can use the local 'tournament' object to find names if structure hasn't drastically changed,
            // or fetch again if needed. For names, the old object is fine usually.
            const { partido } = findMatch(tournament, matchId);
            const matchDesc = partido ? `${partido.equipoA.nombre} vs ${partido.equipoB.nombre}` : matchId;

            await interaction.editReply({ content: `✅ Resultado actualizado correctamente para **${matchDesc}**: **${resultString}**` });
        } catch (error) {
            console.error("Error al procesar resultado manual:", error);
            await interaction.editReply({ content: `❌ Error al actualizar el resultado: ${error.message}` });
        }
        return;
    }

    if (action === 'admin_edit_team_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, captainId] = params;

        const newTeamName = interaction.fields.getTextInputValue('team_name_input');
        const newEafcName = interaction.fields.getTextInputValue('eafc_name_input');
        const newTwitter = interaction.fields.getTextInputValue('twitter_input');
        const newStreamChannel = interaction.fields.getTextInputValue('stream_url_input');
        const newLogoUrl = interaction.fields.getTextInputValue('logo_url_input'); // AÑADE ESTA LÍNEA

        // --- FIX: Renombrar canal de voz si el nombre del equipo cambió ---
        const currentTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (currentTournament && currentTournament.teams && currentTournament.teams.aprobados[captainId]) {
            const oldTeamData = currentTournament.teams.aprobados[captainId];
            if (oldTeamData.nombre !== newTeamName && oldTeamData.voiceChannelId) {
                try {
                    const guild = await client.guilds.fetch(currentTournament.guildId);
                    const voiceChannel = await guild.channels.fetch(oldTeamData.voiceChannelId).catch(() => null);
                    if (voiceChannel) {
                        await voiceChannel.setName(`🔊 ${newTeamName}`);
                        console.log(`[CHANNELS] Canal de voz renombrado de '🔊 ${oldTeamData.nombre}' a '🔊 ${newTeamName}'`);
                    }
                } catch (err) {
                    console.error(`[CHANNELS] Error renombrando canal de voz para el equipo editado:`, err);
                }
            }
        }
        // --- FIN FIX ---

        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            {
                $set: {
                    [`teams.aprobados.${captainId}.nombre`]: newTeamName,
                    [`teams.aprobados.${captainId}.eafcTeamName`]: newEafcName,
                    [`teams.aprobados.${captainId}.twitter`]: newTwitter,
                    [`teams.aprobados.${captainId}.streamChannel`]: newStreamChannel,
                    [`teams.aprobados.${captainId}.logoUrl`]: newLogoUrl // AÑADE ESTA LÍNEA
                }
            }
        );

        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        await updatePublicMessages(client, updatedTournament);
        await notifyTournamentVisualizer(updatedTournament);

        await interaction.editReply({ content: `✅ Los datos del equipo **${newTeamName}** han sido actualizados con éxito.` });
        return;
    }

    if (customId.startsWith('config_draft_')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const quotas = interaction.fields.getTextInputValue('quotas_input');
        const isMin = customId.includes('min');

        if (isMin) {
            await updateBotSettings({ draftMinQuotas: quotas });
            await interaction.editReply({ content: '✅ Se han actualizado las cuotas MÍNIMAS para iniciar un draft.' });
        } else {
            await updateBotSettings({ draftMaxQuotas: quotas });
            await interaction.editReply({ content: '✅ Se han actualizado las cuotas MÁXIMAS de jugadores por equipo.' });
        }
        return;
    }

    if (action === 'report_player_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId, teamId, playerId] = params;
        const reason = interaction.fields.getTextInputValue('reason_input');
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        try {
            await requestStrike(client, draft, interaction.user.id, teamId, playerId, reason);
            await interaction.editReply({ content: '✅ Tu solicitud de strike ha sido enviada a los administradores.' });
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
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;

        // Leemos los DOS nuevos campos de la ventana
        const targetCaptains = parseInt(interaction.fields.getTextInputValue('target_captains_input'));
        const amount = parseInt(interaction.fields.getTextInputValue('amount_input'));

        // Verificamos que ambos campos sean números válidos
        if (isNaN(targetCaptains) || targetCaptains <= 0 || isNaN(amount) || amount <= 0) {
            return interaction.editReply({ content: '❌ Los valores deben ser números mayores que cero.' });
        }

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) {
            return interaction.editReply({ content: '❌ No se encontró el draft.' });
        }

        const currentCaptainCount = draft.captains.length;

        // --- INICIO DE LA NUEVA LÓGICA DE CÁLCULO ---
        const captainsNeeded = Math.max(0, targetCaptains - currentCaptainCount);
        const captainsToAdd = Math.min(captainsNeeded, amount); // No podemos crear más capitanes que el total pedido
        const playersToAdd = amount - captainsToAdd; // El resto serán jugadores libres
        // --- FIN DE LA NUEVA LÓGICA DE CÁLCULO ---

        const positions = Object.keys(DRAFT_POSITIONS);
        const bulkCaptains = [];
        const bulkPlayers = [];

        // Bucle para crear los capitanes necesarios
        for (let i = 0; i < captainsToAdd; i++) {
            const uniqueId = `test_cap_${Date.now()}_${i}`;
            const newCaptainCount = currentCaptainCount + bulkCaptains.length;
            const teamName = `E-Prueba-${newCaptainCount + 1}`;

            const captainData = {
                userId: uniqueId, userName: `TestCaptain#${1000 + i}`, teamName: teamName,
                streamChannel: 'https://twitch.tv/test', psnId: `Capi-Test-${newCaptainCount + 1}`, eafcTeamName: `EAFC-Test-${newCaptainCount + 1}`, twitter: 'test_captain', position: "DC"
            };
            const captainAsPlayerData = {
                userId: uniqueId, userName: captainData.userName, psnId: captainData.psnId, twitter: captainData.twitter,
                primaryPosition: captainData.position, secondaryPosition: 'NONE', currentTeam: teamName, isCaptain: true, captainId: uniqueId
            };
            bulkCaptains.push(captainData);
            bulkPlayers.push(captainAsPlayerData);
        }

        // Bucle para crear los jugadores libres restantes
        for (let i = 0; i < playersToAdd; i++) {
            const uniqueId = `test_plr_${Date.now()}_${i}`;
            const primaryPos = positions[Math.floor(Math.random() * positions.length)];
            let secondaryPos = positions[Math.floor(Math.random() * positions.length)];
            if (primaryPos === secondaryPos) secondaryPos = 'NONE';

            const playerData = {
                userId: uniqueId, userName: `TestPlayer#${2000 + i}`, psnId: `Jugador-Test-${i + 1}`,
                twitter: 'test_player', primaryPosition: primaryPos, secondaryPosition: secondaryPos,
                currentTeam: 'Libre', isCaptain: false, captainId: null
            };
            bulkPlayers.push(playerData);
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
        await notifyVisualizer(updatedDraft);

        // Mensaje final mucho más claro
        await interaction.editReply({ content: `✅ ¡Operación completada! Se han añadido **${bulkCaptains.length} capitanes** y **${playersToAdd} jugadores** de prueba.` });
        return;
    }

    if (action === 'admin_import_players_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const text = interaction.fields.getTextInputValue('player_list_input');

        try {
            const result = await handleImportedPlayers(client, draftShortId, text);
            await interaction.editReply({ content: result.message });
        } catch (error) {
            console.error("Error en importación:", error);
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
        return;
    }

    if (action === 'admin_add_captain_manual_submit') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId, discordId] = params;

        const psnId = interaction.fields.getTextInputValue('captain_psn_id').trim();
        const teamName = interaction.fields.getTextInputValue('captain_team_name').trim();
        const primaryPosition = interaction.fields.getTextInputValue('captain_primary_pos').trim().toUpperCase();

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) return interaction.editReply({ content: '❌ Torneo/Draft no encontrado.' });

        if (draft.captains.some(c => c.userId === discordId)) {
            return interaction.editReply({ content: '❌ Este usuario ya es capitán en este draft.' });
        }

        let userName = discordId;
        try {
            const user = await client.users.fetch(discordId);
            userName = user.globalName || user.username;
        } catch (e) {
            console.warn(`No se pudo obtener el usuario de Discord para ID: ${discordId}`);
        }

        // --- MANEJO DE VERIFICACIÓN AUTOMÁTICA ---
        const verifiedUser = await db.collection('verified_users').findOne({ discordId: discordId });

        await db.collection('verified_users').updateOne(
            { discordId: discordId },
            {
                $set: {
                    psnId: psnId,
                    whatsapp: verifiedUser && verifiedUser.whatsapp ? verifiedUser.whatsapp : '',
                    twitter: verifiedUser && verifiedUser.twitter ? verifiedUser.twitter : '',
                    isCaptain: true
                },
                $setOnInsert: { verifiedAt: new Date() }
            },
            { upsert: true }
        );

        if (!verifiedUser) {
            try {
                const guild = client.guilds.cache.get(process.env.GUILD_ID);
                if (guild && process.env.VERIFIED_ROLE_ID) {
                    const memberToVerify = await guild.members.fetch(discordId);
                    if (memberToVerify) await memberToVerify.roles.add(process.env.VERIFIED_ROLE_ID);
                }
            } catch (err) { console.error(`No se pudo dar rol a ${discordId}`, err); }
        }
        // ----------------------------------------

        const newCaptain = {
            userId: discordId,
            userName: userName,
            psnId: psnId,
            primaryPosition: primaryPosition,
            secondaryPosition: 'NONE',
            teamName: teamName,
            isCaptain: true
        };

        // --- FIX: Si el usuario ya estaba como jugador (ej: importado de WhatsApp), eliminarlo primero ---
        // Buscar por userId O por psnId (case-insensitive) para cubrir jugadores importados por TXT
        const existingPlayer = draft.players.find(p => p.userId === discordId || p.psnId.toLowerCase() === psnId.toLowerCase());
        if (existingPlayer) {
            await db.collection('drafts').updateOne(
                { _id: draft._id },
                { $pull: { players: { userId: existingPlayer.userId } } }
            );
        }

        // Ahora añadir como capitán + jugador-capitán
        await db.collection('drafts').updateOne(
            { _id: draft._id },
            {
                $push: {
                    captains: newCaptain,
                    players: {
                        userId: discordId,
                        userName: userName,
                        psnId: psnId,
                        twitter: existingPlayer?.twitter || '',
                        whatsapp: existingPlayer?.whatsapp || (verifiedUser ? verifiedUser.whatsapp : ''),
                        primaryPosition: primaryPosition,
                        secondaryPosition: 'NONE',
                        currentTeam: teamName,
                        isCaptain: true,
                        captainId: discordId,
                        strikes: existingPlayer?.strikes || 0,
                        hasBeenReportedByCaptain: false,
                        kickRequestPending: false
                    }
                }
            }
        );

        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        await updateDraftMainInterface(client, updatedDraft.shortId);
        await updatePublicMessages(client, updatedDraft);
        await updateDraftManagementPanel(client, updatedDraft);
        await notifyVisualizer(updatedDraft);

        await interaction.editReply({ content: `✅ Capitán **${userName}** (${teamName}) añadido exitosamente de forma manual.` });
        return;
    }

    if (action === 'admin_add_player_manual_modal') {
        const [draftShortId, primaryPosition, discordId] = params;
        const psnId = interaction.fields.getTextInputValue('psn_id_input').trim();

        let twitter = '';
        try {
            twitter = interaction.fields.getTextInputValue('twitter_input').trim();
        } catch (e) { } // Opcional

        const whatsapp = interaction.fields.getTextInputValue('whatsapp_input').trim();

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) return interaction.reply({ content: '❌ Torneo/Draft no encontrado.', flags: [MessageFlags.Ephemeral] });

        // Intentamos obtener el tag de discord del usuario, o usamos un placeholder
        let userTag = 'Usuario Manual';
        try {
            const user = await client.users.fetch(discordId);
            userTag = user.tag;
        } catch (e) {
            console.warn(`No se pudo validar el Discord ID ${discordId} al añadir jugador manual.`);
        }

        const playerData = {
            userId: discordId,
            userName: userTag,
            psnId: psnId,
            twitter: twitter,
            whatsapp: whatsapp,
            primaryPosition: primaryPosition,
            secondaryPosition: 'NONE', // Por simplicidad, se deja sin sec en manual
            currentTeam: 'Libre',
            isCaptain: false,
            captainId: null
        };

        // --- MANEJO DE VERIFICACIÓN AUTOMÁTICA ---
        const verifiedUser = await db.collection('verified_users').findOne({ discordId: discordId });

        await db.collection('verified_users').updateOne(
            { discordId: discordId },
            {
                $set: {
                    psnId: psnId,
                    whatsapp: whatsapp || (verifiedUser && verifiedUser.whatsapp ? verifiedUser.whatsapp : ''),
                    twitter: twitter || (verifiedUser && verifiedUser.twitter ? verifiedUser.twitter : ''),
                    isCaptain: false
                },
                $setOnInsert: { verifiedAt: new Date() }
            },
            { upsert: true }
        );

        if (!verifiedUser) {
            try {
                const guild = client.guilds.cache.get(process.env.GUILD_ID);
                if (guild && process.env.VERIFIED_ROLE_ID) {
                    const memberToVerify = await guild.members.fetch(discordId);
                    if (memberToVerify) await memberToVerify.roles.add(process.env.VERIFIED_ROLE_ID);
                }
            } catch (err) { console.error(`No se pudo dar rol a ${discordId}`, err); }
        }
        // ----------------------------------------

        const result = await adminAddPlayerToDraft(client, draft, playerData);

        if (result.success) {
            await interaction.reply({ content: `✅ Jugador **${psnId}** (${discordId}) añadido correctamente a la posición **${primaryPosition}**.`, flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: `❌ ${result.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    if (action === 'admin_add_participant_manual_modal') {
        const [draftShortId, discordId] = params;
        const psnId = interaction.fields.getTextInputValue('manual_game_id').trim();
        const whatsapp = interaction.fields.getTextInputValue('manual_whatsapp').trim();
        const primaryPosition = interaction.fields.getTextInputValue('manual_position').trim().toUpperCase();

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) return interaction.reply({ content: '❌ Torneo/Draft no encontrado.', flags: [MessageFlags.Ephemeral] });

        let userTag = 'Usuario Manual';
        try {
            const user = await client.users.fetch(discordId);
            userTag = user.tag;
        } catch (e) {
            console.warn(`No se pudo validar el Discord ID ${discordId} al añadir participante manual.`);
        }

        const playerData = {
            userId: discordId,
            userName: userTag,
            psnId: psnId,
            twitter: '',
            whatsapp: whatsapp,
            primaryPosition: primaryPosition,
            secondaryPosition: 'NONE',
            currentTeam: 'Libre',
            isCaptain: false,
            captainId: null
        };

        // --- MANEJO DE VERIFICACIÓN AUTOMÁTICA ---
        const verifiedUser = await db.collection('verified_users').findOne({ discordId: discordId });

        await db.collection('verified_users').updateOne(
            { discordId: discordId },
            {
                $set: {
                    psnId: psnId,
                    whatsapp: whatsapp || (verifiedUser && verifiedUser.whatsapp ? verifiedUser.whatsapp : ''),
                    twitter: verifiedUser && verifiedUser.twitter ? verifiedUser.twitter : '',
                    isCaptain: false
                },
                $setOnInsert: { verifiedAt: new Date() }
            },
            { upsert: true }
        );

        if (!verifiedUser) {
            try {
                const guild = client.guilds.cache.get(process.env.GUILD_ID);
                if (guild && process.env.VERIFIED_ROLE_ID) {
                    const memberToVerify = await guild.members.fetch(discordId);
                    if (memberToVerify) await memberToVerify.roles.add(process.env.VERIFIED_ROLE_ID);
                }
            } catch (err) { console.error(`No se pudo dar rol a ${discordId}`, err); }
        }
        // ----------------------------------------

        const result = await adminAddPlayerToDraft(client, draft, playerData);

        if (result.success) {
            await interaction.reply({ content: `✅ Participante **${psnId}** (${discordId}) añadido correctamente a la posición **${primaryPosition}**.`, flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: `❌ ${result.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    // --- NUEVOS FLUJOS: JUGADORES FANTASMA ---
    if (action === 'admin_ghost_partic_submit' || action === 'admin_ghost_plr_submit') {
        let draftShortId, primaryPosition;
        if (action === 'admin_ghost_partic_submit') {
            [draftShortId] = params;
            primaryPosition = interaction.fields.getTextInputValue('ghost_position').trim().toUpperCase();
        } else {
            [draftShortId, primaryPosition] = params;
        }

        const psnId = interaction.fields.getTextInputValue('ghost_game_id').trim();
        const whatsapp = interaction.fields.getTextInputValue('ghost_whatsapp').trim();

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        if (!draft) return interaction.reply({ content: '❌ Torneo/Draft no encontrado.', flags: [MessageFlags.Ephemeral] });

        const randomId = Math.random().toString(36).substring(2, 10);
        const externalId = `ext_${randomId}`;

        const playerData = {
            userId: externalId,
            userName: `Fantasma (${psnId})`,
            psnId: psnId,
            twitter: 'N/A', // Sin twitter
            whatsapp: whatsapp,
            primaryPosition: primaryPosition,
            secondaryPosition: 'NONE',
            currentTeam: 'Libre',
            isCaptain: false,
            captainId: null,
            isExternal: true // Se marca como externo
        };

        const result = await adminAddPlayerToDraft(client, draft, playerData);

        if (result.success) {
            await interaction.reply({ content: `✅ Fantasma **${psnId}** añadido correctamente a **${primaryPosition}** (ID: ${externalId}).`, flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: `❌ ${result.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
    }
    // --- FIN FLUJOS FANTASMA ---

    if (action === 'admin_edit_draft_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;

        const newName = interaction.fields.getTextInputValue('draft_name_input').trim();
        const entryFee = parseFloat(interaction.fields.getTextInputValue('draft_fee_input'));
        const prizeCampeon = parseFloat(interaction.fields.getTextInputValue('draft_prize_champ_input'));
        const prizeFinalista = parseFloat(interaction.fields.getTextInputValue('draft_prize_runnerup_input'));

        if (isNaN(entryFee) || isNaN(prizeCampeon) || isNaN(prizeFinalista)) {
            return interaction.editReply('❌ Por favor, usa solo números en los campos de dinero.');
        }

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        await db.collection('drafts').updateOne(
            { shortId: draftShortId },
            {
                $set: {
                    name: newName,
                    'config.entryFee': entryFee,
                    'config.prizeCampeon': prizeCampeon,
                    'config.prizeFinalista': prizeFinalista
                }
            }
        );

        const updatedDraft = await db.collection('drafts').findOne({ shortId: draftShortId });

        await updateDraftMainInterface(client, updatedDraft.shortId);
        await updatePublicMessages(client, updatedDraft);
        await updateDraftManagementPanel(client, updatedDraft);

        await interaction.editReply({ content: `✅ La configuración del draft **${newName}** ha sido actualizada.` });
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

    if (action === 'register_verified_draft_captain_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const [draftShortId, position, streamPlatform] = params;
        const db = getDb();
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        let verifiedData = await db.collection('verified_users').findOne({ discordId: interaction.user.id });

        if (!draft || !verifiedData) {
            return interaction.editReply({ content: '❌ Error: No se encontró el draft o tus datos de verificación.' });
        }

        try {
            const whatsappInput = interaction.fields.getTextInputValue('whatsapp_input');
            const whatsappConfirmInput = interaction.fields.getTextInputValue('whatsapp_confirm_input');

            if (whatsappInput.trim() !== whatsappConfirmInput.trim()) {
                return interaction.editReply({ content: '❌ Los números de WhatsApp no coinciden. Por favor, reinicia el proceso.' });
            }

            await db.collection('verified_users').updateOne(
                { discordId: interaction.user.id },
                { $set: { whatsapp: whatsappInput.trim() } }
            );

            verifiedData = await db.collection('verified_users').findOne({ discordId: interaction.user.id });
        } catch (error) {
            if (error.code !== 'ModalSubmitInteractionFieldNotFound') {
                console.error("Error inesperado al procesar WhatsApp en modal de capitán:", error);
                return interaction.editReply({ content: '❌ Hubo un error inesperado procesando tus datos.' });
            }
        }

        const teamName = interaction.fields.getTextInputValue('team_name_input');
        const eafcTeamName = interaction.fields.getTextInputValue('eafc_team_name_input');
        const streamUsername = interaction.fields.getTextInputValue('stream_username_input');
        const streamChannel = streamPlatform === 'twitch' ? `https://twitch.tv/${streamUsername}` : `https://youtube.com/@${streamUsername}`;
        const userId = interaction.user.id;

        const captainData = { userId, userName: interaction.user.tag, teamName, eafcTeamName, streamChannel, psnId: verifiedData.gameId, twitter: verifiedData.twitter, whatsapp: verifiedData.whatsapp, position };

        await db.collection('drafts').updateOne(
            { _id: draft._id },
            { $set: { [`pendingCaptains.${userId}`]: captainData } }
        );

        await interaction.editReply('✅ ¡Tu solicitud para ser capitán ha sido recibida! Un administrador la revisará pronto.');

        try {
            const approvalChannel = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId);
            const adminEmbed = new EmbedBuilder()
                .setColor('#5865F2').setTitle(`🔔 Nueva Solicitud de Capitán (Verificado)`)
                .setDescription(`**Draft:** ${draft.name}`)
                .addFields(
                    { name: 'Nombre de Equipo', value: captainData.teamName, inline: true }, { name: 'Capitán', value: interaction.user.tag, inline: true },
                    { name: 'PSN ID', value: captainData.psnId, inline: false }, { name: 'WhatsApp', value: `\`${captainData.whatsapp}\``, inline: false },
                    { name: 'Equipo EAFC', value: captainData.eafcTeamName, inline: false }, { name: 'Canal Transmisión', value: captainData.streamChannel, inline: false },
                    { name: 'Twitter', value: captainData.twitter || 'No proporcionado', inline: false }
                );
            const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`draft_approve_captain:${draftShortId}:${userId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`draft_reject_captain:${draftShortId}:${userId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
            await approvalChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
        } catch (e) {
            console.error("Failed to send captain application to admin channel:", e);
        }
        return;
    }

    if (action === 'add_whatsapp_to_profile_modal') {
        const [flow, draftShortId, primaryPosition, secondaryPosition, teamStatus, channelId] = params;
        const whatsapp = interaction.fields.getTextInputValue('whatsapp_input').trim();
        const whatsappConfirm = interaction.fields.getTextInputValue('whatsapp_confirm_input').trim();

        if (whatsapp !== whatsappConfirm) {
            return interaction.reply({ content: '❌ Los números de WhatsApp no coinciden. Por favor, reinicia el proceso.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const db = getDb();

        await db.collection('verified_users').updateOne(
            { discordId: interaction.user.id },
            { $set: { whatsapp } },
            { upsert: true }
        );

        const verifiedData = await db.collection('verified_users').findOne({ discordId: interaction.user.id });
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        if (flow === 'player') {
            if (teamStatus === 'Con Equipo') {
                const teamNameModal = new ModalBuilder()
                    .setCustomId(`register_draft_player_team_name_modal:${draftShortId}:${primaryPosition}:${secondaryPosition}:${channelId}`)
                    .setTitle('Último Dato: Tu Equipo Actual');
                const currentTeamInput = new TextInputBuilder().setCustomId('current_team_input').setLabel("Nombre de tu equipo actual").setStyle(TextInputStyle.Short).setRequired(true);
                teamNameModal.addComponents(new ActionRowBuilder().addComponents(currentTeamInput));

                return interaction.showModal(teamNameModal);
            } else {
                const playerData = {
                    userId: interaction.user.id, userName: interaction.user.tag,
                    psnId: verifiedData.gameId, twitter: verifiedData.twitter, whatsapp: verifiedData.whatsapp,
                    primaryPosition, secondaryPosition, currentTeam: 'Libre',
                    isCaptain: false, captainId: null
                };
                await db.collection('drafts').updateOne({ _id: draft._id }, { $push: { players: playerData } });

                await interaction.editReply('✅ ¡Inscripción completada!');

                if (channelId && channelId !== 'no-ticket') {
                    const ticketChannel = await client.channels.fetch(channelId).catch(() => null);
                    if (ticketChannel) {
                        await ticketChannel.send('✅ Proceso de inscripción finalizado. Este canal se cerrará en 10 segundos.');
                        setTimeout(() => ticketChannel.delete('Inscripción completada.').catch(console.error), 10000);
                    }
                }

                const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
                updatePublicMessages(client, updatedDraft);
                updateDraftMainInterface(client, updatedDraft.shortId);
                notifyVisualizer(updatedDraft);
            }
        }
        return;
    }

    if (action === 'register_draft_captain_modal' || action === 'register_draft_player_modal') {
        const [draftShortId, p1, p2, p3, ticketChannelId] = params;
        const isFromTicket = ticketChannelId && ticketChannelId !== 'no-ticket';

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const isRegisteringAsCaptain = action.includes('captain');
        let position, primaryPosition, secondaryPosition, teamStatus, streamPlatform;

        if (isRegisteringAsCaptain) {
            [position, streamPlatform] = [p1, p2];
        } else {
            [primaryPosition, secondaryPosition, teamStatus] = [p1, p2, p3];
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

        let whatsapp = '';
        try { whatsapp = interaction.fields.getTextInputValue('whatsapp_input'); } catch (e) { }
        try { if (!whatsapp) whatsapp = interaction.fields.getTextInputValue('whatsapp_confirm_input'); } catch (e) { }

        const psnId = interaction.fields.getTextInputValue('psn_id_input');

        let twitter = '';
        try { twitter = interaction.fields.getTextInputValue('twitter_input'); } catch (e) { }

        if (isRegisteringAsCaptain) {

            const teamName = interaction.fields.getTextInputValue('team_name_input');
            const eafcTeamName = interaction.fields.getTextInputValue('eafc_team_name_input');
            const streamUsername = interaction.fields.getTextInputValue('stream_username_input');
            const streamChannel = streamPlatform === 'twitch' ? `https://twitch.tv/${streamUsername}` : `https://youtube.com/@${streamUsername}`;

            if (draft.captains.some(c => c.teamName.toLowerCase() === teamName.toLowerCase())) return interaction.editReply('❌ Ya existe un equipo con ese nombre.');

            captainData = { userId, userName: interaction.user.tag, teamName, eafcTeamName, streamChannel, psnId, twitter, whatsapp, position };
            playerData = { userId, userName: interaction.user.tag, psnId, twitter, whatsapp, primaryPosition: position, secondaryPosition: 'NONE', currentTeam: teamName, isCaptain: true, captainId: userId };

        } else {
            let currentTeam;
            if (teamStatus === 'Con Equipo') {
                currentTeam = interaction.fields.getTextInputValue('current_team_input');
            } else {
                currentTeam = 'Libre';
            }
            playerData = { userId, userName: interaction.user.tag, psnId, twitter, whatsapp, primaryPosition, secondaryPosition, currentTeam, isCaptain: false, captainId: null };
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
                // FIX: Comprobar si ya existe una entrada manual con el mismo psnId (importada vía texto/admin)
                const existingManualPlayer = draft.players.find(p =>
                    p.psnId.toLowerCase() === psnId.toLowerCase() && p.userId !== userId && !p.isCaptain
                );

                if (existingManualPlayer) {
                    // Actualizar la entrada existente con los datos reales de Discord
                    await db.collection('drafts').updateOne(
                        { _id: draft._id, "players.userId": existingManualPlayer.userId },
                        {
                            $set: {
                                "players.$.userId": userId,
                                "players.$.userName": interaction.user.tag,
                                "players.$.psnId": psnId,
                                "players.$.twitter": twitter || existingManualPlayer.twitter,
                                "players.$.whatsapp": whatsapp || existingManualPlayer.whatsapp,
                                "players.$.primaryPosition": primaryPosition || existingManualPlayer.primaryPosition,
                                "players.$.secondaryPosition": secondaryPosition || existingManualPlayer.secondaryPosition,
                                "players.$.currentTeam": playerData.currentTeam
                            }
                        }
                    );
                    console.log(`[DRAFT] Jugador manual "${existingManualPlayer.psnId}" (${existingManualPlayer.userId}) fusionado con cuenta Discord ${userId} (${interaction.user.tag})`);
                    await interaction.editReply(`✅ ¡Te has inscrito como jugador! (Tu entrada importada previamente ha sido actualizada con tu cuenta de Discord.)`);
                } else {
                    await db.collection('drafts').updateOne({ _id: draft._id }, { $push: { players: playerData } });
                    await interaction.editReply(`✅ ¡Te has inscrito como jugador!`);
                }

                if (isFromTicket) {
                    const ticketChannel = await client.channels.fetch(ticketChannelId).catch(() => null);
                    if (ticketChannel) {
                        await ticketChannel.send('✅ Proceso de inscripción finalizado. Este canal se cerrará en 10 segundos.');
                        setTimeout(() => ticketChannel.delete('Inscripción completada.').catch(console.error), 10000);
                    }
                }

                const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
                updatePublicMessages(client, updatedDraft);
                updateDraftMainInterface(client, updatedDraft.shortId);
                notifyVisualizer(updatedDraft);
            }
        }
        return;
    }

    if (action === 'draft_payment_confirm_modal') {
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

    if (action === 'admin_edit_rules_url_modal') {
        const urlInput = interaction.fields.getTextInputValue('rules_url_input');
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        await updateBotSettings({ rulesUrl: urlInput });
        await interaction.editReply(`✅ El enlace de normativa global ha sido actualizado a: **${urlInput}**.\n\n_Nota: Los próximos menús que utilicen este enlace lo cargarán de manera dinámica._`);
        return;
    }

    if (action === 'admin_modify_elo_percentage_modal') {
        const percentageStr = interaction.fields.getTextInputValue('elo_percentage_input');
        const percentage = parseFloat(percentageStr);
        if (isNaN(percentage)) {
            return interaction.reply({ content: '❌ El porcentaje debe ser un número válido (ej: -30 o 50).', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const settings = await getBotSettings();
        
        const basePlayoff = { champion: 150, runner_up: 80, semifinalist: 40, quarterfinalist: 15, round_of_16: -20, groups_top_half: -30, groups_bottom_half: -50 };
        const baseLeague = { first: 120, second: 75, third: 40, top_half: 15, bottom_half: -35, last: -60 };

        const multiplier = 1 + (percentage / 100);

        const newPlayoff = {};
        for (const [k, v] of Object.entries(basePlayoff)) newPlayoff[k] = Math.round(v * multiplier);
        
        const newLeague = {};
        for (const [k, v] of Object.entries(baseLeague)) newLeague[k] = Math.round(v * multiplier);

        await updateBotSettings({ 
            eloConfig: {
                playoff: newPlayoff,
                league: newLeague
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(`✅ Configuración ELO Actualizada (${percentage > 0 ? '+'+percentage : percentage}%)`)
            .setColor('Green')
            .setDescription('La configuración del ELO ha sido modificada y guardada exitosamente. Así han quedado los nuevos premios y castigos:')
            .addFields(
                { name: '🏆 PLAYOFFS (Torneos con eliminatorias)', value: 
`Campeón: **${newPlayoff.champion > 0 ? '+'+newPlayoff.champion : newPlayoff.champion}**
Finalista: **${newPlayoff.runner_up > 0 ? '+'+newPlayoff.runner_up : newPlayoff.runner_up}**
Semifinales: **${newPlayoff.semifinalist > 0 ? '+'+newPlayoff.semifinalist : newPlayoff.semifinalist}**
Cuartos: **${newPlayoff.quarterfinalist > 0 ? '+'+newPlayoff.quarterfinalist : newPlayoff.quarterfinalist}**
Octavos: **${newPlayoff.round_of_16 > 0 ? '+'+newPlayoff.round_of_16 : newPlayoff.round_of_16}**
Grupos (Zona Alta): **${newPlayoff.groups_top_half > 0 ? '+'+newPlayoff.groups_top_half : newPlayoff.groups_top_half}**
Grupos (Zona Baja): **${newPlayoff.groups_bottom_half > 0 ? '+'+newPlayoff.groups_bottom_half : newPlayoff.groups_bottom_half}**` },
                { name: '📊 LIGA PURA (Sin Playoff)', value: 
`1º Puesto: **${newLeague.first > 0 ? '+'+newLeague.first : newLeague.first}**
2º Puesto: **${newLeague.second > 0 ? '+'+newLeague.second : newLeague.second}**
3º Puesto: **${newLeague.third > 0 ? '+'+newLeague.third : newLeague.third}**
Mitad Superior: **${newLeague.top_half > 0 ? '+'+newLeague.top_half : newLeague.top_half}**
Mitad Inferior: **${newLeague.bottom_half > 0 ? '+'+newLeague.bottom_half : newLeague.bottom_half}**
Último Puesto: **${newLeague.last > 0 ? '+'+newLeague.last : newLeague.last}**` }
            );

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    if (action === 'admin_recover_round_modal') {
        const [tournamentShortId] = params;
        const roundNumStr = interaction.fields.getTextInputValue('round_input');
        const roundNum = parseInt(roundNumStr);
        
        if (isNaN(roundNum) || roundNum <= 0) {
            return interaction.reply({ content: '❌ La jornada debe ser un número válido mayor a 0.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        if (!tournament || !tournament.structure || !tournament.structure.calendario || !tournament.structure.calendario['Liga']) {
            return interaction.editReply({ content: '❌ Torneo o calendario de Liga no encontrado.' });
        }

        const ligaMatches = tournament.structure.calendario['Liga'];
        const badMatches = ligaMatches.filter(m => m.jornada >= roundNum);
        
        if (badMatches.length === 0) {
            return interaction.editReply({ content: `❌ No se encontraron partidos guardados para la Jornada ${roundNum} o superiores.` });
        }

        let deletedThreads = 0;
        for (const match of badMatches) {
            if (match.threadId) {
                try {
                    const thread = await client.channels.fetch(match.threadId);
                    if (thread) {
                        await thread.delete('Regeneración forzada de jornada');
                        deletedThreads++;
                    }
                } catch (e) {
                    console.warn(`No se pudo borrar el hilo ${match.threadId}: ${e.message}`);
                }
            }
        }

        tournament.structure.calendario['Liga'] = ligaMatches.filter(m => m.jornada < roundNum);
        tournament.currentRound = roundNum - 1;

        await db.collection('tournaments').updateOne(
            { _id: tournament._id }, 
            { 
               $set: { 
                   "structure.calendario.Liga": tournament.structure.calendario['Liga'],
                   "currentRound": tournament.currentRound 
               },
               $unset: {
                   advancementLock: ""
               }
            }
        );

        const { generateNextSwissRound, updatePublicMessages } = await import('../logic/tournamentLogic.js');
        const guild = await client.guilds.fetch(tournament.guildId).catch(() => null);
        
        if (guild) {
            await generateNextSwissRound(client, guild, tournament);
        }

        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        await updatePublicMessages(client, updatedTournament);

        await interaction.editReply({ content: `✅ **Jornada ${roundNum} regenerada con éxito.**\nSe eliminaron ${deletedThreads} hilos antiguos e inválidos.` });
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
        await interaction.reply({
            content: '⏳ ¡Recibido! Creando el torneo en segundo plano. Esto puede tardar unos segundos...',
            flags: [MessageFlags.Ephemeral]
        });

        const [formatId, type, matchType, paidSubType, leaguesEncoded] = params;
        const nombre = interaction.fields.getTextInputValue('torneo_nombre');
        let shortId = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        // Garantizar unicidad del shortId para evitar E11000 duplicate key error
        let suffix = 1;
        while (await db.collection('tournaments').findOne({ shortId })) {
            suffix++;
            shortId = `${nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${suffix}`;
        }

        const config = { formatId, isPaid: type === 'pago', matchType: matchType };
        if (paidSubType && paidSubType.startsWith('KO_')) {
            // Knockout final round selection (e.g. KO_semifinales)
            config.knockoutFinalRound = paidSubType.replace('KO_', '');
        } else if (paidSubType && paidSubType !== 'none') {
            config.paidSubType = paidSubType; // 'draft' o 'cash_cup'
        }

        // --- PARSE ALLOWED LEAGUES ---
        if (leaguesEncoded && leaguesEncoded !== 'ALL' && leaguesEncoded !== 'none') {
            config.allowedLeagues = leaguesEncoded.split('|').filter(l => ['DIAMOND', 'GOLD', 'SILVER', 'BRONZE'].includes(l));
        } else {
            config.allowedLeagues = []; // Vacío = todas las ligas
        }
        // --- FIN PARSE ALLOWED LEAGUES ---

        // Safe read for start time (might be missing in paid flexible leagues)
        try {
            config.startTime = interaction.fields.getTextInputValue('torneo_start_time') || null;
        } catch (e) {
            config.startTime = null;
        }

        if (config.isPaid) {
            config.entryFee = parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee'));
            const [prizeC = '0', prizeF = '0'] = interaction.fields.getTextInputValue('torneo_prizes').split('/');
            config.prizeCampeon = parseFloat(prizeC.trim());
            config.prizeFinalista = parseFloat(prizeF.trim());
            const paymentMethods = interaction.fields.getTextInputValue('torneo_payment_methods') || '/';
            const [paypal = null, bizum = null] = paymentMethods.split('/');
            config.paypalEmail = paypal ? paypal.trim() : null;
            config.bizumNumber = bizum ? bizum.trim() : null;
        }

        // --- INTERCEPCIÓN PARA LIGUILLA FLEXIBLE ---
        if (formatId === 'flexible_league') {
            // Read qualifiers
            try {
                const qualifiersVal = interaction.fields.getTextInputValue('torneo_qualifiers');
                config.qualifiers = parseInt(qualifiersVal) || 0;
            } catch (e) {
                config.qualifiers = 0;
            }

            const pendingId = `pending_${shortId}_${Date.now()}`;
            await db.collection('pending_tournaments').insertOne({
                pendingId,
                nombre,
                shortId,
                config,
                createdAt: new Date()
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`create_flexible_league_mode:swiss:${pendingId}`)
                    .setLabel('Sistema Suizo')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎲'),
                new ButtonBuilder()
                    .setCustomId(`create_flexible_league_mode:round_robin:${pendingId}`)
                    .setLabel('Liguilla Completa')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('⚔️'),
                new ButtonBuilder()
                    .setCustomId(`create_flexible_league_mode:round_robin_custom:${pendingId}`)
                    .setLabel('Liguilla (Rondas Custom)')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔢')
            );

            await interaction.followUp({
                content: `🛠️ **Configuración de Liguilla Flexible**\nHas elegido el formato flexible. Por favor, selecciona cómo quieres que se juegue:`,
                components: [row],
                flags: [MessageFlags.Ephemeral]
            });
            return;
        }
        // --- FIN INTERCEPCIÓN ---

        // --- INICIO DE LA CORRECCIÓN CLAVE ---
        try {
            const result = await createNewTournament(client, guild, nombre, shortId, config);

            // Ahora usamos followUp para enviar un mensaje nuevo en lugar de editar.
            if (result.success) {
                await interaction.followUp({ content: `✅ ¡Éxito! El torneo **"${nombre}"** ha sido creado.`, flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.followUp({ content: `❌ Ocurrió un error al crear el torneo: ${result.message}`, flags: [MessageFlags.Ephemeral] });
            }
        } catch (error) {
            console.error("Error CRÍTICO durante la creación del torneo:", error);
            await interaction.followUp({ content: `❌ Ocurrió un error muy grave al crear el torneo. Revisa los logs.`, flags: [MessageFlags.Ephemeral] });
        }
        // --- FIN DE LA CORRECCIÓN CLAVE ---
        return;
    }

    if (action === 'rename_tournament_modal') {
        await interaction.reply({ content: '⏳ Renombrando torneo...', flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const newName = interaction.fields.getTextInputValue('new_tournament_name').trim();
        if (!newName || newName.length < 2) {
            return interaction.editReply({ content: '❌ El nombre debe tener al menos 2 caracteres.' });
        }
        try {
            await db.collection('tournaments').updateOne(
                { shortId: tournamentShortId },
                { $set: { nombre: newName } }
            );
            const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            const { updateTournamentManagementThread } = await import('../utils/panelManager.js');
            const { updatePublicMessages, notifyTournamentVisualizer } = await import('../logic/tournamentLogic.js');
            await updateTournamentManagementThread(client, updatedTournament);
            await updatePublicMessages(client, updatedTournament);
            await notifyTournamentVisualizer(updatedTournament);
            await interaction.editReply({ content: `✅ Torneo renombrado a **${newName}**.` });
        } catch (error) {
            console.error('Error al renombrar torneo:', error);
            await interaction.editReply({ content: `❌ Error al renombrar: ${error.message}` });
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

        // --- VALIDACIÓN DE LIGA/ELO ---
        if (!tournament.config.isPaid && tournament.config.allowedLeagues && tournament.config.allowedLeagues.length > 0) {
            const testDb = getDb('test');
            const teamName = interaction.fields.getTextInputValue('nombre_equipo_input');
            const captainId = interaction.user.id;
            
            // Buscar equipo por managerId o por nombre (fuzzy)
            let registeredTeam = await testDb.collection('teams').findOne({ managerId: captainId, guildId: tournament.guildId });
            if (!registeredTeam) {
                const safeTeamName = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                registeredTeam = await testDb.collection('teams').findOne({ name: { $regex: new RegExp(`^${safeTeamName}$`, 'i') }, guildId: tournament.guildId });
            }
            
            if (registeredTeam) {
                const teamLeague = registeredTeam.league || getLeagueByElo(registeredTeam.elo || 1000);
                if (!tournament.config.allowedLeagues.includes(teamLeague)) {
                    const allowedEmojis = tournament.config.allowedLeagues.map(l => `${LEAGUE_EMOJIS[l] || ''} ${l}`).join(', ');
                    const teamEmoji = LEAGUE_EMOJIS[teamLeague] || '';
                    return interaction.editReply(
                        `❌ Tu equipo está en liga **${teamEmoji} ${teamLeague}**.\n` +
                        `Este torneo solo admite: **${allowedEmojis}**.\n\n` +
                        `❌ Your team is in the **${teamEmoji} ${teamLeague}** league.\n` +
                        `This tournament only allows: **${allowedEmojis}**.`
                    );
                }
            } else {
                // Equipo no encontrado en la BD → permitir inscripción con advertencia
                console.warn(`[LEAGUE CHECK] Equipo "${teamName}" no encontrado en la BD para validación de liga. Se permite inscripción.`);
            }
        }
        // --- FIN VALIDACIÓN DE LIGA/ELO ---

        const captainId = interaction.user.id;
        const isAlreadyInTournament = tournament.teams.aprobados[captainId] || tournament.teams.pendientes[captainId] || (tournament.teams.reserva && tournament.teams.reserva[captainId]);
        if (isAlreadyInTournament) {
            return interaction.editReply({ content: '❌ 🇪🇸 Ya estás inscrito o en la lista de reserva de este torneo.\n🇬🇧 You are already registered or on the waitlist for this tournament.' });
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
            // NUEVO FLUJO: Doble aprobación
            // 1. Guardar en pendingApproval (NO pendingPayments)
            const pendingApprovalData = {
                userId: captainId,
                userTag: interaction.user.tag,
                teamName: teamName,
                eafcTeamName: eafcTeamName,
                streamChannel: streamChannel,
                twitter: twitter,
                registeredAt: new Date(),
                status: 'awaiting_payment_info_approval'
            };

            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.pendingApproval.${captainId}`]: pendingApprovalData } }
            );

            // 2. Notificar a admin para PRIMERA aprobación (enviar info de pago)
            const adminEmbed = new EmbedBuilder()
                .setColor('#f39c12')
                .setTitle(`💰 Nueva Solicitud - Torneo de Pago`)
                .setDescription(`Usuario quiere inscribirse en **${tournament.nombre}**`)
                .addFields(
                    { name: 'Usuario', value: `<@${captainId}>`, inline: true },
                    { name: 'Equipo', value: teamName, inline: true },
                    { name: 'EAFC Team', value: eafcTeamName, inline: false },
                    { name: 'Stream', value: streamChannel || 'N/A', inline: true },
                    { name: 'Twitter', value: twitter || 'N/A', inline: true }
                )
                .setFooter({ text: 'Aprueba para enviarle la información de pago' });

            const adminButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_approve_payment_info:${captainId}:${tournament.shortId}`)
                    .setLabel('✅ Aprobar - Enviar Info Pago')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`admin_reject:${captainId}:${tournament.shortId}`)
                    .setLabel('❌ Rechazar Solicitud')
                    .setStyle(ButtonStyle.Danger)
            );

            await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });

            // 3. Responder al usuario
            await interaction.editReply(
                '✅ 🇪🇸 ¡Solicitud recibida! Un administrador revisará tu inscripción y te enviará la información de pago.\n\n' +
                '🇬🇧 Request received! An administrator will review your registration and send you the payment information.'
            );

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
            const sentMessage = await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });

            // Save adminMessageId to database
            const db = getDb();
            if (tournament.teams.pendingApproval && tournament.teams.pendingApproval[interaction.user.id]) {
                await db.collection('tournaments').updateOne(
                    { _id: tournament._id },
                    { $set: { [`teams.pendingApproval.${interaction.user.id}.adminMessageId`]: sentMessage.id } }
                );
            }

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
        const userId = interaction.user.id;

        // --- FIX: Check pendingPayments first (New Flow) ---
        let teamData = null;
        let isPendingPayment = false;

        if (tournament.teams.pendingPayments && tournament.teams.pendingPayments[userId]) {
            teamData = tournament.teams.pendingPayments[userId];
            isPendingPayment = true;

            // Update PayPal in pendingPayments
            await db.collection('tournaments').updateOne(
                { shortId: tournamentShortId },
                { $set: { [`teams.pendingPayments.${userId}.paypal`]: userPaypal } }
            );
        } else if (tournament.teams.pendientes && tournament.teams.pendientes[userId]) {
            // Fallback for old flow or if somehow in pendientes
            teamData = tournament.teams.pendientes[userId];

            // Update PayPal in pendientes
            await db.collection('tournaments').updateOne(
                { shortId: tournamentShortId },
                { $set: { [`teams.pendientes.${userId}.paypal`]: userPaypal } }
            );
        }

        if (!teamData) return interaction.editReply('❌ No se encontró tu inscripción pendiente. Por favor, inscríbete de nuevo.');

        // Normalize fields for Embed
        const teamName = isPendingPayment ? teamData.teamName : teamData.nombre;
        const captainTag = isPendingPayment ? teamData.userTag : teamData.capitanTag;

        const adminEmbed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle(`💰 Notificación de Pago`)
            .addFields(
                { name: 'Equipo', value: teamName || 'Desconocido', inline: true },
                { name: 'Capitán', value: captainTag || 'Desconocido', inline: true },
                { name: "PayPal del Capitán", value: `\`${userPaypal}\`` }
            );

        const adminButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_approve:${userId}:${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`admin_reject:${userId}:${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

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

        // --- INICIO DE LA LÓGICA CORREGIDA ---
        const teamsCount = Object.keys(tournament.teams.aprobados).length;
        let amountToAdd;

        if (tournament.config.format.size > 0) {
            // Lógica antigua y correcta para torneos con límite (8, 16...)
            const availableSlots = tournament.config.format.size - teamsCount;
            amountToAdd = Math.min(amount, availableSlots);
        } else {
            // Nueva lógica para la liguilla, que no tiene límite de slots
            amountToAdd = amount;
        }

        if (amountToAdd <= 0) {
            // Añadimos una respuesta clara para el admin si no se puede añadir a nadie
            return interaction.editReply({ content: 'ℹ️ No se pueden añadir más equipos de prueba. El torneo ya está lleno o la cantidad introducida es cero.' });
        }
        // --- FIN DE LA LÓGICA CORREGIDA ---

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
        await notifyTournamentVisualizer(updatedTournament);

        return;
    }
    if (action === 'report_result_modal') {
        // El canal del hilo de partido puede haber sido borrado entre la apertura del modal y su envío
        try {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        } catch (deferError) {
            if (deferError.code === 10003) { // Unknown Channel
                console.warn(`[REPORT RESULT] El canal del hilo de partido ya no existe. No se puede procesar el resultado.`);
                return;
            }
            throw deferError; // Re-lanzar si es otro error
        }
        const [matchId, tournamentShortId] = params;
        let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const { partido } = findMatch(tournament, matchId);
        if (!partido) return interaction.editReply('Error: Partido no encontrado.');

        // FIX 1: Actualizamos los datos de los equipos con la información más reciente.
        partido.equipoA = tournament.teams.aprobados[partido.equipoA.capitanId];
        partido.equipoB = tournament.teams.aprobados[partido.equipoB.capitanId];
        if (!partido.equipoA || !partido.equipoB) {
            return interaction.editReply({ content: 'Error: No se pudieron encontrar los datos actualizados de uno de los equipos.' });
        }

        const golesA = interaction.fields.getTextInputValue('goles_a');
        const golesB = interaction.fields.getTextInputValue('goles_b');
        if (isNaN(parseInt(golesA)) || isNaN(parseInt(golesB))) return interaction.editReply('Error: Los goles deben ser números.');
        const reportedResult = `${golesA}-${golesB}`;
        const reporterId = interaction.user.id;

        // Identificamos el equipo del reportador
        let myTeam, opponentTeam;
        const isTeamA = reporterId === partido.equipoA.capitanId ||
            reporterId === partido.equipoA.coCaptainId ||
            reporterId === partido.equipoA.managerId ||
            (partido.equipoA.extraCaptains && partido.equipoA.extraCaptains.includes(reporterId));

        const isTeamB = reporterId === partido.equipoB.capitanId ||
            reporterId === partido.equipoB.coCaptainId ||
            reporterId === partido.equipoB.managerId ||
            (partido.equipoB.extraCaptains && partido.equipoB.extraCaptains.includes(reporterId));

        if (isTeamA) {
            myTeam = partido.equipoA;
            opponentTeam = partido.equipoB;
        } else if (isTeamB) {
            myTeam = partido.equipoB;
            opponentTeam = partido.equipoA;
        } else {
            return interaction.editReply({ content: 'Error: No pareces ser un capitán o co-capitán de este partido.' });
        }

        // --- LÓGICA UNIFICADA DE REPORTE (GRATUITO Y PAGO) ---
        // Ahora TODOS los torneos usan el sistema de "Doble Verificación".
        // - Si es GRATUITO: El 'checkOverdueMatches' (vigilante) validará a los 3 min si el rival no responde.
        // - Si es PAGO: El 'checkOverdueMatches' lo ignorará, esperando indefinidamente confirmación o admin.

        // Inicializamos el objeto de reportes si no existe
        if (!partido.reportedScores) partido.reportedScores = {};

        // Guardamos el reporte actual
        partido.reportedScores[reporterId] = { score: reportedResult, reportedAt: new Date(), teamId: myTeam.id };

        // Buscamos si hay un reporte del equipo rival
        const opponentCaptainIds = [opponentTeam.capitanId];
        if (opponentTeam.coCaptainId) opponentCaptainIds.push(opponentTeam.coCaptainId);
        if (opponentTeam.extraCaptains) opponentCaptainIds.push(...opponentTeam.extraCaptains);

        let opponentReport = null;
        let opponentReporterId = null;

        for (const id of opponentCaptainIds) {
            if (partido.reportedScores[id]) {
                opponentReport = partido.reportedScores[id];
                opponentReporterId = id;
                break;
            }
        }

        // PASO 1: Guardamos ATÓMICAMENTE solo nuestro reporte en la DB.
        // Usamos la ruta exacta al campo para evitar race conditions.
        const matchPath = findMatchPath(tournament, matchId);
        if (!matchPath) return interaction.editReply('Error: Ruta del partido no encontrada en la estructura.');

        await db.collection('tournaments').updateOne(
            { _id: tournament._id },
            { $set: { [`${matchPath}.reportedScores.${reporterId}`]: { score: reportedResult, reportedAt: new Date(), teamId: myTeam.id } } }
        );

        // PASO 2: Re-leer el torneo DESPUÉS de guardar, para ver si el rival ya guardó el suyo.
        tournament = await db.collection('tournaments').findOne({ _id: tournament._id });
        const { partido: updatedPartido } = findMatch(tournament, matchId);

        // Buscamos el reporte del rival en los datos FRESCOS de la DB
        let freshOpponentReport = null;
        let freshOpponentReporterId = null;
        for (const id of opponentCaptainIds) {
            if (updatedPartido.reportedScores && updatedPartido.reportedScores[id]) {
                freshOpponentReport = updatedPartido.reportedScores[id];
                freshOpponentReporterId = id;
                break;
            }
        }

        if (freshOpponentReport) {
            if (freshOpponentReport.score === reportedResult) {
                // COINCIDENCIA: Finalizamos el partido
                await interaction.editReply({ content: '✅ **Confirmado:** Tu resultado coincide con el del rival. Finalizando el partido...' });

                try {
                    const processedMatch = await processMatchResult(client, guild, tournament, matchId, reportedResult);
                    await finalizeMatchThread(client, processedMatch, reportedResult);
                } catch (error) {
                    console.error(`[REPORT RESULT] Error al finalizar el partido ${matchId}:`, error);
                    await interaction.editReply({ content: '⚠️ El resultado coincide, pero hubo un error al procesar. Un admin debe forzar el resultado.' }).catch(() => {});
                }
            } else {
                // CONFLICTO: Avisamos a árbitros
                await interaction.editReply({ content: '❌ **Conflicto:** El resultado que has puesto NO coincide con el del rival. Se ha avisado a los árbitros.' });

                const thread = interaction.channel;
                if (thread.isThread()) {
                    await thread.setName(`⚠️-DISPUTA-${thread.name}`.slice(0, 100));
                    await thread.send({ content: `🚨 <@&${ARBITRO_ROLE_ID}> **DISPUTA DETECTADA**\n\n- <@${reporterId}> (${myTeam.nombre}) dice: **${reportedResult}**\n- <@${freshOpponentReporterId}> (${opponentTeam.nombre}) dice: **${freshOpponentReport.score}**\n\nPor favor, revisad las pruebas.` });
                }
            }
        } else {
            // PRIMER REPORTE: Avisamos y esperamos
            // Si es gratuito, el cronómetro de 3 minutos empieza a contar (gracias a reportedAt).
            const opponentMentions = opponentCaptainIds.map(id => `<@${id}>`).join(' ');
            try {
                await interaction.editReply({ content: `✅ Resultado (**${reportedResult}**) guardado. Esperando confirmación del rival...` });
                await interaction.channel.send(`ℹ️ <@${reporterId}> ha reportado el resultado: **${reportedResult}**. ${opponentMentions}, por favor usad el botón para confirmar el vuestro.`);
            } catch (replyError) {
                console.warn(`[REPORT RESULT] No se pudo confirmar visualmente el resultado ${reportedResult} (el mensaje o canal ya no existe). El resultado SÍ fue guardado en la DB.`);
            }
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

        // Responder ANTES del procesamiento pesado para evitar expiración de la interacción o error 10008 (hilo borrado)
        await interaction.editReply(`✅ Resultado forzado a **${resultString}** por un administrador. Procesando...`);

        try {
            const processedMatch = await processMatchResult(client, guild, tournament, matchId, resultString);
            await finalizeMatchThread(client, processedMatch, resultString);
        } catch (error) {
            console.error(`[FORCE RESULT] Error al procesar resultado forzado para ${matchId}:`, error);
            try {
                await interaction.followUp({ content: `⚠️ Hubo un error al procesar el resultado forzado para el partido \`${matchId}\`. El resultado probablemente se guardó en la DB pero alguna operación secundaria falló. Revisa el panel de gestión.`, flags: [MessageFlags.Ephemeral] });
            } catch (e) { /* La interacción pudo haber expirado */ }
        }

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
        if (team.coCaptainId) return interaction.editReply({ content: 'Ya tienes un co-capitán.' });

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

    if (action === 'admin_edit_draft_captain_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId, captainId] = params;

        const newTeamName = interaction.fields.getTextInputValue('team_name_input');
        const newPsnId = interaction.fields.getTextInputValue('psn_id_input');
        const newStreamUrl = interaction.fields.getTextInputValue('stream_url_input');

        // Actualizamos tanto en la lista de capitanes como en la de jugadores
        await db.collection('drafts').updateOne(
            { shortId: draftShortId, "captains.userId": captainId },
            {
                $set: {
                    "captains.$.teamName": newTeamName,
                    "captains.$.psnId": newPsnId,
                    "captains.$.streamChannel": newStreamUrl,
                }
            }
        );
        await db.collection('drafts').updateOne(
            { shortId: draftShortId, "players.userId": captainId },
            {
                $set: {
                    "players.$.psnId": newPsnId,
                }
            }
        );

        const updatedDraft = await db.collection('drafts').findOne({ shortId: draftShortId });

        await updateDraftMainInterface(client, updatedDraft.shortId);
        await updatePublicMessages(client, updatedDraft);
        await notifyVisualizer(updatedDraft);

        await interaction.editReply({ content: `✅ Los datos del capitán del equipo **${newTeamName}** han sido actualizados.` });
        return;
    }
    if (action === 'admin_edit_strikes_submit') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [userId] = params;
        const newStrikesValue = interaction.fields.getTextInputValue('strikes_input');
        const newStrikes = parseInt(newStrikesValue);

        // Verificamos que sea un número válido
        if (isNaN(newStrikes) || newStrikes < 0) {
            return interaction.editReply({ content: '❌ El valor introducido no es un número válido. Debe ser 0 o mayor.' });
        }

        // Actualizamos o creamos el registro del jugador
        await db.collection('player_records').updateOne(
            { userId: userId },
            { $set: { strikes: newStrikes } },
            { upsert: true } // Esto crea el registro si no existe, o lo actualiza si ya existe
        );

        const user = await client.users.fetch(userId);
        await interaction.editReply({ content: `✅ Los strikes de **${user.tag}** han sido establecidos en **${newStrikes}**.` });
        return;
    }

    if (action === 'request_kick_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId, teamId, playerIdToKick] = params;
        const reason = interaction.fields.getTextInputValue('reason_input');
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        try {
            await requestPlayerKick(client, draft, teamId, playerIdToKick, reason);
            await interaction.editReply({ content: '✅ Tu solicitud para expulsar al jugador ha sido enviada a los administradores para su revisión.' });
        } catch (error) {
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
        return;
    }
    if (action === 'unregister_draft_reason_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const reason = interaction.fields.getTextInputValue('reason_input');
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        try {
            const result = await requestUnregisterFromDraft(client, draft, interaction.user.id, reason);
            return interaction.editReply({ content: result.message });
        } catch (error) {
            return interaction.editReply({ content: `❌ Error al procesar la solicitud: ${error.message}` });
        }
    }
    if (action === 'register_draft_player_team_name_modal') {
        const [draftShortId, primaryPosition, secondaryPosition, channelId] = params;
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const verifiedData = await db.collection('verified_users').findOne({ discordId: interaction.user.id });

        if (!draft || !verifiedData) {
            return interaction.editReply('❌ Error: No se encontró el draft o tus datos de verificación.');
        }

        const currentTeam = interaction.fields.getTextInputValue('current_team_input');

        const playerData = {
            userId: interaction.user.id,
            userName: interaction.user.tag,
            psnId: verifiedData.gameId,
            twitter: verifiedData.twitter,
            whatsapp: verifiedData.whatsapp,
            primaryPosition,
            secondaryPosition,
            currentTeam,
            isCaptain: false,
            captainId: null
        };

        await db.collection('drafts').updateOne({ _id: draft._id }, { $push: { players: playerData } });

        await interaction.editReply(`✅ ¡Inscripción completada! Hemos usado tus datos verificados.`);
        if (channelId && channelId !== 'no-ticket') {
            const ticketChannel = await client.channels.fetch(channelId).catch(() => null);
            if (ticketChannel) {
                await ticketChannel.send('✅ Proceso de inscripción finalizado. Este canal se cerrará en 10 segundos.');
                setTimeout(() => ticketChannel.delete('Inscripción completada.').catch(console.error), 10000);
            }
        }

        const notificationsThread = await client.channels.fetch(draft.discordMessageIds.notificationsThreadId).catch(() => null);
        if (notificationsThread) {
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('👋 Nuevo Jugador Inscrito (Discord)')
                .setDescription(`El jugador **${playerData.userName}** (${playerData.psnId}) se ha apuntado al draft.`)
                .addFields(
                    { name: 'Posición Principal', value: primaryPosition, inline: true },
                    { name: 'Equipo Actual', value: currentTeam || 'Libre', inline: true }
                )
                .setFooter({ text: `Draft: ${draft.name} | ID del Jugador: ${playerData.userId}` });
            await notificationsThread.send({ embeds: [embed] });
        }

        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        updatePublicMessages(client, updatedDraft);
        updateDraftMainInterface(client, updatedDraft.shortId);
        notifyVisualizer(updatedDraft);
        return;
    }

    if (action === 'admin_edit_verified_submit') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        // --- INICIO DE LA CORRECCIÓN ---
        // La asignación correcta es esta, sin la coma al principio.
        const [userId, fieldToEdit] = params;
        // --- FIN DE LA CORRECCIÓN ---
        const newValue = interaction.fields.getTextInputValue('new_value_input');

        await db.collection('verified_users').updateOne(
            { discordId: userId },
            { $set: { [fieldToEdit]: newValue } }
        );

        const activeDrafts = await db.collection('drafts').find({
            "players.userId": userId,
            status: { $nin: ['finalizado', 'torneo_generado', 'cancelado'] }
        }).toArray();

        if (activeDrafts.length > 0) {
            const fieldMap = { gameId: 'psnId', twitter: 'twitter', whatsapp: 'whatsapp' };
            const draftField = fieldMap[fieldToEdit];

            if (draftField) {
                await db.collection('drafts').updateMany(
                    { "players.userId": userId },
                    { $set: { [`players.$.${draftField}`]: newValue } }
                );

                for (const draft of activeDrafts) {
                    const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
                    updateDraftMainInterface(client, updatedDraft.shortId);
                    notifyVisualizer(updatedDraft);
                }
            }
        }

        // Ahora `userId` tiene el valor correcto y esta línea funcionará.
        const user = await client.users.fetch(userId);
        await interaction.editReply({ content: `✅ El campo \`${fieldToEdit}\` de **${user.tag}** ha sido actualizado a \`${newValue}\` y sincronizado.` });
        return;
    }
    if (action === 'create_flexible_league_submit') {
        await interaction.reply({
            content: '⏳ ¡Recibido! Creando la liga personalizada...',
            flags: [MessageFlags.Ephemeral]
        });

        const [type, leagueMode] = params;
        const nombre = interaction.fields.getTextInputValue('torneo_nombre');
        const qualifiers = parseInt(interaction.fields.getTextInputValue('torneo_qualifiers'));
        const legsRaw = interaction.fields.getTextInputValue('match_legs_input').toLowerCase();

        const isDoubleLeg = legsRaw.includes('si') || legsRaw.includes('yes') || legsRaw === '2';
        const matchType = isDoubleLeg ? 'idavuelta' : 'ida';

        let customRounds = 0;
        if (leagueMode === 'custom_rounds') {
            customRounds = parseInt(interaction.fields.getTextInputValue('custom_rounds_input'));
            if (isNaN(customRounds) || customRounds < 1) {
                return interaction.editReply('❌ El número de rondas debe ser un número válido mayor a 0.');
            }
        }

        if (isNaN(qualifiers) || ![0, 2, 4, 8, 16, 32].includes(qualifiers)) {
            return interaction.editReply({ content: '❌ Error: El número de clasificados debe ser 0 (Liga Pura) o potencia de 2 (2, 4, 8...).' });
        }

        const shortId = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const config = {
            formatId: 'flexible_league',
            isPaid: type === 'pago',
            qualifiers: qualifiers,
            leagueMode: leagueMode, // 'all_vs_all' o 'custom_rounds'
            customRounds: customRounds,
            matchType: matchType
        };

        if (config.isPaid) {
            config.entryFee = parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee'));
            const [prizeC = '0', prizeF = '0'] = interaction.fields.getTextInputValue('torneo_prizes').split('/');
            config.prizeCampeon = parseFloat(prizeC.trim());
            config.prizeFinalista = parseFloat(prizeF.trim());
            // Valores por defecto para métodos de pago ya que no caben en el modal
            config.paypalEmail = PAYMENT_CONFIG.PAYPAL_EMAIL;
            config.bizumNumber = null;
        }

        try {
            const result = await createNewTournament(client, guild, nombre, shortId, config);
            if (result.success) {
                let modeText = leagueMode === 'all_vs_all' ? "Todos contra Todos" : `${customRounds} Partidos por equipo`;
                let legsText = isDoubleLeg ? "Ida y Vuelta" : "Solo Ida";
                await interaction.editReply({ content: `✅ ¡Éxito! Liga **"${nombre}"** creada.\n⚙️ Config: ${modeText}, ${legsText}, clasifican ${qualifiers}.` });
            } else {
                await interaction.editReply({ content: `❌ Ocurrió un error: ${result.message}` });
            }
        } catch (error) {
            console.error("Error:", error);
            await interaction.editReply({ content: `❌ Ocurrió un error crítico.` });
        }
        return;
    }
    if (action === 'draft_league_all_vs_all_modal' || action === 'draft_league_custom_modal' || action === 'draft_league_swiss_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;

        const qualifiersRaw = interaction.fields.getTextInputValue('torneo_qualifiers');
        const qualifiers = parseInt(qualifiersRaw);

        const inputKey = action === 'draft_league_all_vs_all_modal' ? 'matches_input' : 'rounds_input';
        const roundsInput = parseInt(interaction.fields.getTextInputValue(inputKey));

        if (isNaN(qualifiers) || qualifiers < 0 || (qualifiers !== 0 && ![2, 4, 8, 16, 32].includes(qualifiers))) {
            return interaction.editReply({ content: '❌ Error: El número de equipos clasificatorios debe ser 0 (Gana el líder), 2, 4, 8, o 16.' });
        }

        if (isNaN(roundsInput) || roundsInput < 1) {
            return interaction.editReply({ content: '❌ Error: El número de partidos/jornadas debe ser al menos 1.' });
        }

        let matchType = 'ida';
        let leagueMode = '';
        let customRounds = null;

        if (action === 'draft_league_all_vs_all_modal') {
            leagueMode = 'all_vs_all';
            if (roundsInput === 1) {
                matchType = 'ida';
            } else if (roundsInput === 2) {
                matchType = 'idavuelta';
            } else {
                return interaction.editReply({ content: '❌ Error: En Todos contra Todos el valor de encuentros debe ser 1 (Ida) o 2 (Ida/Vuelta).' });
            }
        } else if (action === 'draft_league_custom_modal') {
            leagueMode = 'round_robin_custom';
            matchType = 'ida'; // Ida por defecto en custom
            customRounds = roundsInput;
        } else if (action === 'draft_league_swiss_modal') {
            leagueMode = 'custom_rounds';
            matchType = 'ida'; // Ida por defecto en suizo
            customRounds = roundsInput;
        }

        const leagueConfig = {
            qualifiers: qualifiers,
            leagueMode: leagueMode,
            matchType: matchType,
            customRounds: customRounds
        };

        try {
            const newTournament = await createTournamentFromDraft(client, guild, draftShortId, 'flexible_league', leagueConfig);
            await interaction.editReply({
                content: `✅ ¡Liguilla **"${newTournament.nombre}"** creada con éxito a partir del draft! Ya puedes gestionarla desde su hilo.`,
                components: []
            });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Hubo un error crítico: ${error.message}`, components: [] });
        }
        return;
    }
    // Bloque 3: Lógica para procesar el formulario de Modificar Resultado
    if (action === 'admin_modify_final_result_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, matchId] = params;

        let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        // ¡Importante! Aquí no llamamos a revertStats porque processMatchResult ya lo hace internamente.

        const golesA = interaction.fields.getTextInputValue('goles_a');
        const golesB = interaction.fields.getTextInputValue('goles_b');
        const newResultString = `${golesA}-${golesB}`;

        // processMatchResult es lo suficientemente inteligente como para revertir el resultado anterior antes de aplicar el nuevo.
        await processMatchResult(client, guild, tournament, matchId, newResultString);
        // --- INICIO DEL BLOQUE DE REFUERZO ---
        // Volvemos a leer el estado final del torneo desde la DB para asegurar que tenemos los datos más frescos.
        const finalTournamentState = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        // Y ahora, forzamos la notificación al visualizador.
        if (finalTournamentState) {
            await notifyTournamentVisualizer(finalTournamentState);
        }
        // --- FIN DEL BLOQUE DE REFUERZO ---

        await interaction.editReply({ content: `✅ ¡Resultado modificado con éxito a **${newResultString}**! La clasificación y las rondas han sido actualizadas.` });
        return;
    }
    if (customId.startsWith('admin_search_team_modal')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [_, tournamentShortId] = customId.split(':');
        const searchQuery = interaction.fields.getTextInputValue('search_query').toLowerCase();

        const allTeams = await getDb('test').collection('teams').find({ guildId: interaction.guildId }).toArray();
        // Filtramos por nombre (case-insensitive)
        const filteredTeams = allTeams.filter(t => t.name.toLowerCase().includes(searchQuery));

        if (filteredTeams.length === 0) {
            return interaction.editReply({ content: `❌ No se encontraron equipos que contengan "**${searchQuery}**".` });
        }

        filteredTeams.sort((a, b) => a.name.localeCompare(b.name));

        const pageSize = 25;
        const pageCount = Math.ceil(filteredTeams.length / pageSize);
        const page = 0;
        const startIndex = page * pageSize;
        const teamsOnPage = filteredTeams.slice(startIndex, startIndex + pageSize);

        const teamOptions = teamsOnPage.map(team => ({
            label: team.name,
            description: `Manager ID: ${team.managerId}`,
            value: team._id.toString()
        }));

        const teamSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_registered_team_to_add:${tournamentShortId}`)
            .setPlaceholder('Selecciona el equipo a inscribir')
            .addOptions(teamOptions);

        const components = [new ActionRowBuilder().addComponents(teamSelectMenu)];

        if (pageCount > 1) {
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                const startNum = i * pageSize + 1;
                const endNum = Math.min((i + 1) * pageSize, filteredTeams.length);
                pageOptions.push({
                    label: `Página ${i + 1} (${startNum}-${endNum})`,
                    value: `page_${i}`
                });
            }
            // Usamos un customId diferente para la paginación de búsqueda
            // Pasamos la query en los parámetros para no perderla al cambiar de página
            const pageSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_search_team_page_select:${tournamentShortId}:${searchQuery}`)
                .setPlaceholder('Paso 2: Cambiar de página')
                .addOptions(pageOptions);

            components.push(new ActionRowBuilder().addComponents(pageSelectMenu));
        }

        await interaction.editReply({
            content: `✅ Encontrados **${filteredTeams.length}** equipos para "**${searchQuery}**".\nSelecciona uno:`,
            components
        });
        return;
    }

    if (customId.startsWith('admin_replace_team_search_modal')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const parts = customId.split(':');
        const tournamentShortId = parts[1];
        const oldCaptainId = parts[2];
        const searchQuery = interaction.fields.getTextInputValue('replace_search_query').toLowerCase();

        const allTeams = await getDb('test').collection('teams').find({ guildId: interaction.guildId }).toArray();
        const filteredTeams = allTeams.filter(t => t.name.toLowerCase().includes(searchQuery));

        if (filteredTeams.length === 0) {
            return interaction.editReply({ content: `❌ No se encontraron equipos que contengan "**${searchQuery}**". Intenta con otra búsqueda.` });
        }

        filteredTeams.sort((a, b) => a.name.localeCompare(b.name));
        const teamsOnPage = filteredTeams.slice(0, 25);

        const teamOptions = teamsOnPage.map(team => ({
            label: team.name,
            description: `Manager: ${team.managerId}`,
            value: team._id.toString()
        }));

        const teamSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_replace_team_new_select:${tournamentShortId}:${oldCaptainId}`)
            .setPlaceholder('Selecciona el equipo de reemplazo')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: `✅ Encontrados **${filteredTeams.length}** equipos para "**${searchQuery}**".\nSelecciona el equipo que **ENTRA** al torneo:`,
            components: [new ActionRowBuilder().addComponents(teamSelectMenu)]
        });
        return;
    }

    if (action === 'create_flexible_league_swiss_rounds') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [pendingId] = params;
        const rounds = parseInt(interaction.fields.getTextInputValue('swiss_rounds_input'));

        const pendingData = await db.collection('pending_tournaments').findOne({ pendingId });
        if (!pendingData) {
            return interaction.editReply('❌ Error: No se encontraron los datos del torneo pendiente.');
        }

        // --- FIX: Revisar si estamos CREANDO o EDITANDO un formato ---
        if (pendingData.action === 'edit_format') {
            const { targetTournamentShortId, newFormatId, qualifiers } = pendingData;

            await updateTournamentConfig(client, targetTournamentShortId, {
                formatId: newFormatId,
                leagueMode: 'custom_rounds',
                customRounds: rounds,
                qualifiers: qualifiers
            });

            await interaction.editReply(`✅ Formato actualizado a: **Liguilla Flexible (Suizo - ${rounds} rondas)** con ${qualifiers} clasificados.`);
            await db.collection('pending_tournaments').deleteOne({ pendingId });
            return;
        }
        // --- FIN FIX ---

        const { nombre, shortId, config } = pendingData;
        config.leagueMode = 'custom_rounds';
        config.customRounds = rounds;

        try {
            const result = await createNewTournament(client, guild, nombre, shortId, config);
            if (result.success) {
                await interaction.editReply(`✅ ¡Éxito! El torneo **"${nombre}"** (Sistema Suizo - ${rounds} rondas) ha sido creado.`);
            } else {
                await interaction.editReply(`❌ Error al crear el torneo: ${result.message}`);
            }
            await db.collection('pending_tournaments').deleteOne({ pendingId });
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Error crítico al crear el torneo.');
        }
        return;
    }

    if (action === 'create_flexible_league_rr_custom') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [pendingId] = params;
        const rounds = parseInt(interaction.fields.getTextInputValue('rr_rounds_input'));

        const pendingData = await db.collection('pending_tournaments').findOne({ pendingId });
        if (!pendingData) {
            return interaction.editReply('❌ Error: No se encontraron los datos del torneo pendiente.');
        }

        // --- FIX: Revisar si estamos CREANDO o EDITANDO un formato ---
        if (pendingData.action === 'edit_format') {
            const { targetTournamentShortId, newFormatId, qualifiers } = pendingData;

            await updateTournamentConfig(client, targetTournamentShortId, {
                formatId: newFormatId,
                leagueMode: 'round_robin_custom',
                customRounds: rounds,
                qualifiers: qualifiers
            });

            await interaction.editReply(`✅ Formato actualizado a: **Liguilla Flexible (Custom - ${rounds} jornadas)** con ${qualifiers} clasificados.`);
            await db.collection('pending_tournaments').deleteOne({ pendingId });
            return;
        }
        // --- FIN FIX ---

        const { nombre, shortId, config } = pendingData;
        config.leagueMode = 'round_robin_custom';
        config.customRounds = rounds;

        try {
            const result = await createNewTournament(client, guild, nombre, shortId, config);
            if (result.success) {
                await interaction.editReply(`✅ ¡Éxito! El torneo **"${nombre}"** (Liguilla Custom - ${rounds} rondas) ha sido creado.`);
            } else {
                await interaction.editReply(`❌ Error al crear el torneo: ${result.message}`);
            }
            await db.collection('pending_tournaments').deleteOne({ pendingId });
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Error crítico al crear el torneo.');
        }
        return;
    }

    // --- NUEVO HANDLER: DISTRIBUCIÓN DESDE WHATSAPP ---
    if (action === 'admin_distribute_whatsapp_modal') {
        const isAdminOrRef = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID) || interaction.member.roles.cache.has(ARBITRO_ROLE_ID);
        if (!isAdminOrRef) {
            return interaction.reply({ content: '❌ No tienes permisos para usar esto.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const maxTeamsStr = interaction.fields.getTextInputValue('max_teams_per_tournament');
        const waListStr = interaction.fields.getTextInputValue('whatsapp_list_input');
        const maxTeams = parseInt(maxTeamsStr);

        if (isNaN(maxTeams) || maxTeams <= 0) {
            return interaction.editReply({ content: '❌ El número máximo de equipos no es válido.' });
        }

        try {
            // 1. Parsear texto
            const parsedTeams = parseWhatsAppList(waListStr);
            if (parsedTeams.length === 0) {
                return interaction.editReply({ content: '❌ No se encontró ningún equipo en la lista proporcionada. Revisa el formato.' });
            }

            // 2. Obtener torneos activos (solo gratuitos, en inscripción y que requieran ELO)
            const activeTournaments = await db.collection('tournaments').find({ 
                guildId: interaction.guild.id,
                status: 'inscripcion_abierta',
                'config.isPaid': false,
                'config.requireElo': { $ne: false }
            }).toArray();

            if (activeTournaments.length === 0) {
                return interaction.editReply({ content: '❌ No hay torneos gratuitos en fase de "inscripción abierta" en este momento.' });
            }

            // 3. Match con base de datos
            const { matched, unmatched } = await matchTeamsToDatabase(parsedTeams, interaction.guild.id);

            // 4. Distribuir
            const { assignments, overflow } = distributeByElo(matched, activeTournaments, maxTeams);

            // 5. Guardar estado temporal en base de datos para confirmación
            const tempDistribution = {
                _id: new ObjectId(),
                adminId: interaction.user.id,
                timestamp: new Date(),
                assignments: Array.from(assignments.entries()).map(([tId, tArr]) => ({
                    tournamentId: tId,
                    teams: tArr.map(t => ({ managerId: t.dbTeam.managerId, name: t.dbTeam.name, elo: t.elo, league: t.league, extraCaptains: (t.dbTeam.captains || []).filter(id => id !== t.dbTeam.managerId) }))
                })),
                unmatched: unmatched.map(u => u.parsed.teamName),
                overflow: overflow.map(o => o.dbTeam.name)
            };
            await db.collection('tempData').insertOne(tempDistribution);

            // 6. Generar Embed de Previsualización
            const embed = new EmbedBuilder()
                .setTitle('Previsualización de Distribución')
                .setColor('#3498db')
                .setDescription(`Se encontraron **${parsedTeams.length}** equipos en la lista.\nEquipos matcheados con BD: **${matched.length}**`);

            for (const tourney of activeTournaments) {
                const tourneyAssignments = assignments.get(tourney.shortId) || [];
                const maxSpaces = maxTeams - tourneyAssignments.length;
                let text = `Asignados: **${tourneyAssignments.length}** / Max (${maxTeams})\n`;
                if (tourneyAssignments.length > 0) {
                    text += tourneyAssignments.map(t => `- ${t.dbTeam.name} (${LEAGUE_EMOJIS[t.league]} ${t.elo})`).join('\n').substring(0, 900); // Truncar si es muy largo
                } else {
                    text += "Ninguno.";
                }
                embed.addFields({ name: `🏆 ${tourney.nombre}`, value: text });
            }

            if (unmatched.length > 0) {
                embed.addFields({ 
                    name: `❌ No Encontrados en BD (${unmatched.length})`, 
                    value: unmatched.map(u => u.parsed.teamName).slice(0, 20).join(', ') + (unmatched.length > 20 ? '...' : '') 
                });
            }

            if (overflow.length > 0) {
                embed.addFields({ 
                    name: `⚠️ Sin Hueco/Liga (${overflow.length})`, 
                    value: overflow.map(o => o.dbTeam.name).slice(0, 20).join(', ') + (overflow.length > 20 ? '...' : '') 
                });
            }

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`admin_confirm_whatsapp_distribution:${tempDistribution._id.toString()}`)
                .setLabel('Confirmar Inscripción Masiva')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅');

            await interaction.editReply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(confirmBtn)]
            });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Error al procesar la lista: ${error.message}` });
        }
        return;
    }

    // =======================================================
    // --- SISTEMA DE BOLSA DE EQUIPOS: MODALS ---
    // =======================================================

    if (action === 'admin_create_pool_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const poolName = interaction.fields.getTextInputValue('pool_name').trim();
        const poolImage = interaction.fields.getTextInputValue('pool_image')?.trim() || null;
        const minEloRaw = interaction.fields.getTextInputValue('pool_min_elo')?.trim();
        const maxEloRaw = interaction.fields.getTextInputValue('pool_max_elo')?.trim();
        const minElo = minEloRaw ? parseInt(minEloRaw) : null;
        const maxElo = maxEloRaw ? parseInt(maxEloRaw) : null;

        if ((minEloRaw && isNaN(minElo)) || (maxEloRaw && isNaN(maxElo))) {
            return interaction.editReply('❌ Los valores de ELO deben ser números válidos.');
        }
        if (minElo && maxElo && minElo > maxElo) {
            return interaction.editReply('❌ El ELO mínimo no puede ser mayor que el máximo.');
        }

        // Generar shortId único
        const shortId = `pool-${Date.now().toString(36)}`;

        const poolDoc = {
            shortId,
            guildId: interaction.guildId,
            name: poolName,
            imageUrl: poolImage,
            minElo: minElo,
            maxElo: maxElo,
            status: 'open',
            createdBy: interaction.user.id,
            createdAt: new Date(),
            teams: {},
            bannedTeams: [],
            usedInTournaments: {},
            discordMessageId: null,
            discordChannelId: null,
            logThreadId: null
        };

        // Insertar en BD primero
        await db.collection('team_pools').insertOne(poolDoc);

        // Enviar embed público en canal de inscripciones
        try {
            const inscriptionChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_STATUS).catch(() => null);
            if (!inscriptionChannel) {
                return interaction.editReply('❌ No se pudo encontrar el canal de inscripciones.');
            }

            const embedContent = createPoolEmbed(poolDoc);
            const publicMsg = await inscriptionChannel.send(embedContent);

            // Crear hilo de log en canal de aprobaciones
            const approvalsChannel = await client.channels.fetch(CHANNELS.TOURNAMENTS_APPROVALS_PARENT).catch(() => null);
            let logThreadId = null;
            if (approvalsChannel) {
                const thread = await approvalsChannel.threads.create({
                    name: `📦 Bolsa — ${poolName}`.substring(0, 100),
                    autoArchiveDuration: 10080, // 7 días
                    reason: `Hilo de log para la bolsa ${poolName}`
                });
                logThreadId = thread.id;
                await thread.send(`📦 **Bolsa creada:** ${poolName}\nID: \`${shortId}\`\nCreada por: <@${interaction.user.id}>\n\nTodos los movimientos de inscripción se registrarán aquí.`);
            }

            // Actualizar documento con IDs de Discord
            await db.collection('team_pools').updateOne(
                { shortId },
                { $set: {
                    discordMessageId: publicMsg.id,
                    discordChannelId: inscriptionChannel.id,
                    logThreadId: logThreadId
                }}
            );

            await interaction.editReply(`✅ **Bolsa "${poolName}" creada con éxito.**\n📢 Embed publicado en <#${inscriptionChannel.id}>\n📝 Hilo de log: ${logThreadId ? `<#${logThreadId}>` : 'No se pudo crear'}\nID: \`${shortId}\``);
        } catch (error) {
            console.error('[POOL CREATE] Error:', error);
            await interaction.editReply(`⚠️ La bolsa fue creada en la BD (ID: ${shortId}), pero hubo un error al publicar el embed: ${error.message}`);
        }
        return;
    }

    if (customId.startsWith('pool_admin_edit_modal:')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const poolShortId = customId.split(':')[1];
        const newName = interaction.fields.getTextInputValue('pool_name').trim();
        const newImage = interaction.fields.getTextInputValue('pool_image')?.trim() || null;
        const minEloRaw = interaction.fields.getTextInputValue('pool_min_elo')?.trim();
        const maxEloRaw = interaction.fields.getTextInputValue('pool_max_elo')?.trim();
        const minElo = minEloRaw ? parseInt(minEloRaw) : null;
        const maxElo = maxEloRaw ? parseInt(maxEloRaw) : null;

        if ((minEloRaw && isNaN(minElo)) || (maxEloRaw && isNaN(maxElo))) {
            return interaction.editReply('❌ Los valores de ELO deben ser números válidos.');
        }
        if (minElo && maxElo && minElo > maxElo) {
            return interaction.editReply('❌ El ELO mínimo no puede ser mayor que el máximo.');
        }

        await db.collection('team_pools').updateOne(
            { shortId: poolShortId },
            { $set: { name: newName, imageUrl: newImage, minElo: minElo, maxElo: maxElo } }
        );

        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });

        // Actualizar embed público
        try {
            const channel = await client.channels.fetch(pool.discordChannelId).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(pool.discordMessageId).catch(() => null);
                if (msg) {
                    const embedContent = createPoolEmbed(pool);
                    await msg.edit(embedContent);
                }
            }
        } catch (e) { /* ignore */ }

        // Log
        if (pool.logThreadId) {
            const thread = await client.channels.fetch(pool.logThreadId).catch(() => null);
            if (thread) await thread.send(`✏️ Bolsa editada por <@${interaction.user.id}>. Nuevo nombre: **${newName}**`);
        }

        await interaction.editReply(`✅ Bolsa actualizada: **${newName}**`);
        return;
    }

    if (customId.startsWith('pool_admin_add_manual_modal:')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const poolShortId = customId.split(':')[1];
        const searchQuery = interaction.fields.getTextInputValue('team_search').toLowerCase().trim();

        const testDb = getDb('test');
        const allTeams = await testDb.collection('teams').find({ guildId: interaction.guildId }).toArray();
        const filteredTeams = allTeams.filter(t => t.name.toLowerCase().includes(searchQuery));

        if (filteredTeams.length === 0) {
            return interaction.editReply(`❌ No se encontraron equipos que contengan "**${searchQuery}**".`);
        }

        filteredTeams.sort((a, b) => a.name.localeCompare(b.name));
        const teamsToShow = filteredTeams.slice(0, 25);

        const teamOptions = teamsToShow.map(team => ({
            label: team.name,
            description: `ELO: ${team.elo || 1000} | Manager: ${team.managerId}`,
            value: team._id.toString()
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`pool_admin_add_manual_select:${poolShortId}`)
            .setPlaceholder('Selecciona el equipo a añadir')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: `✅ Encontrados **${filteredTeams.length}** equipos. Selecciona el que quieres añadir a la bolsa:`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (customId.startsWith('admin_edit_team_strikes_modal:')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const teamDbId = customId.split(':')[1];
        const newStrikesStr = interaction.fields.getTextInputValue('strikes_value').trim();
        const newStrikes = parseInt(newStrikesStr);

        if (isNaN(newStrikes) || newStrikes < 0 || newStrikes > 10) {
            return interaction.editReply('❌ El valor debe ser un número entre 0 y 10.');
        }

        const testDb = getDb('test');
        await testDb.collection('teams').updateOne(
            { _id: new ObjectId(teamDbId) },
            { $set: { strikes: newStrikes } }
        );

        const team = await testDb.collection('teams').findOne({ _id: new ObjectId(teamDbId) });
        
        const strikesEmoji = newStrikes >= 3 ? '🚫' : '⚠️';
        await interaction.editReply(`${strikesEmoji} Strikes de **${team.name}** actualizados a **${newStrikes}**.${newStrikes >= 3 ? '\n🚫 Este equipo **no podrá inscribirse** en torneos ni bolsas.' : ''}`);
        return;
    }

    if (action === 'admin_search_team_strikes_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const searchQuery = interaction.fields.getTextInputValue('team_search').toLowerCase().trim();

        const testDb = getDb('test');
        const allTeams = await testDb.collection('teams').find({ guildId: interaction.guildId }).toArray();
        const filteredTeams = allTeams.filter(t => t.name.toLowerCase().includes(searchQuery));

        if (filteredTeams.length === 0) {
            return interaction.editReply(`❌ No se encontraron equipos que contengan "**${searchQuery}**".`);
        }

        filteredTeams.sort((a, b) => a.name.localeCompare(b.name));
        const teamsToShow = filteredTeams.slice(0, 25);

        const teamOptions = teamsToShow.map(team => ({
            label: `${team.name} — ${team.strikes || 0} strikes`,
            description: `ELO: ${team.elo || 1000} | ${(team.strikes || 0) >= 3 ? '🚫 BANEADO' : '✅ OK'}`,
            value: team._id.toString()
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_select_team_for_strikes')
            .setPlaceholder('Selecciona un equipo para editar sus strikes')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: `✅ Encontrados **${filteredTeams.length}** equipos. Selecciona uno para editar sus strikes:`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    // Modal: ¿Cuántos equipos meter de bolsa a torneo?
    if (customId.startsWith('admin_pool_count_modal:')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const parts = customId.split(':');
        const poolShortId = parts[1];
        const tournamentShortId = parts[2];
        const countRaw = interaction.fields.getTextInputValue('pool_team_count').trim();
        const count = parseInt(countRaw);

        if (isNaN(count) || count <= 0) {
            return interaction.editReply('❌ Debes introducir un número válido mayor que 0.');
        }

        const pool = await db.collection('team_pools').findOne({ shortId: poolShortId });
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!pool) return interaction.editReply('❌ Bolsa no encontrada.');
        if (!tournament) return interaction.editReply('❌ Torneo no encontrado.');

        const teamCount = Object.keys(pool.teams || {}).length;
        const finalCount = Math.min(count, teamCount);

        if (finalCount === 0) {
            return interaction.editReply('❌ No hay equipos en la bolsa.');
        }

        // Preview: show top N teams
        const poolTeams = Object.values(pool.teams || {});
        poolTeams.sort((a, b) => b.elo - a.elo);
        const preview = poolTeams.slice(0, finalCount);

        const { LEAGUE_EMOJIS } = await import('../logic/eloLogic.js');
        const previewText = preview.map((t, i) => {
            const leagueEmoji = LEAGUE_EMOJIS[t.league] || '🥉';
            return `${i + 1}. ${leagueEmoji} **${t.teamName}** — ELO: ${t.elo}`;
        }).join('\n');

        // Truncate preview if too long
        const displayPreview = previewText.length > 3500
            ? previewText.substring(0, 3450) + '\n... (lista truncada)'
            : previewText;

        const approvedCount = Object.keys(tournament.teams?.aprobados || {}).length;

        const confirmEmbed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('⚠️ Confirmar Asignación')
            .setDescription(
                `📦 **Bolsa:** ${pool.name} (${teamCount} equipos)\n` +
                `🏆 **Torneo:** ${tournament.nombre} (${approvedCount} ya inscritos)\n\n` +
                `Se van a inscribir **${finalCount}** equipos (top ELO):\n\n${displayPreview}\n\n` +
                `⚠️ Esta acción inscribirá automáticamente estos equipos. ¿Confirmar?`
            );

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_pool_assign_confirm:${poolShortId}:${tournamentShortId}:${finalCount}`)
                .setLabel(`Confirmar (${finalCount} equipos)`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('pool_admin_cancel')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({
            embeds: [confirmEmbed],
            components: [confirmRow]
        });
        return;
    }
}
