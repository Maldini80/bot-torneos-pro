// --- INICIO DEL ARCHIVO modalHandler.js (VERSIÓN FINAL, COMPLETA Y CORREGIDA) ---

import { ObjectId } from 'mongodb';
import { getDb, updateBotSettings } from '../../database.js';
// --- CÓDIGO MODIFICADO Y CORRECTO ---
import { createNewTournament, updateTournamentConfig, updatePublicMessages, forceResetAllTournaments, addTeamToWaitlist, notifyCastersOfNewTeam, createNewDraft, approveDraftCaptain, updateDraftMainInterface, requestStrike, requestPlayerKick, notifyTournamentVisualizer, notifyVisualizer, createTournamentFromDraft, handleImportedPlayers, addSinglePlayerToDraft, sendPaymentApprovalRequest } from '../logic/tournamentLogic.js';
import { processVerification, processProfileUpdate } from '../logic/verificationLogic.js';
import { processMatchResult, findMatch, finalizeMatchThread } from '../logic/matchLogic.js';
// --- LÍNEA CORREGIDA Y COMPLETA ---
import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, StringSelectMenuBuilder, ChannelType, PermissionsBitField, TextInputBuilder, TextInputStyle, ModalBuilder } from 'discord.js';
import { CHANNELS, ARBITRO_ROLE_ID, PAYMENT_CONFIG, DRAFT_POSITIONS, ADMIN_APPROVAL_CHANNEL_ID } from '../../config.js';
import { updateTournamentManagementThread, updateDraftManagementPanel } from '../utils/panelManager.js';
import { createDraftStatusEmbed } from '../utils/embeds.js';
const VERIFICATION_TICKET_CATEGORY_ID = '1396814712649551974';

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

    // =======================================================
    // --- LÓGICA DE INSCRIPCIÓN MANUAL (ADMIN) ---
    // =======================================================

    if (action === 'admin_manual_register_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, userId] = params;

        const teamName = interaction.fields.getTextInputValue('team_name_input');
        const paymentRef = interaction.fields.getTextInputValue('payment_ref_input');
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
            paypal: paymentRef, // Guardamos la referencia del pago manual aquí
            inscritoEn: new Date(),
            isPaid: true,
            isManualRegistration: true
        };

        try {
            // Usamos approveTeam para gestionar la entrada oficial
            const { approveTeam } = await import('../logic/tournamentLogic.js');
            await approveTeam(client, tournament, teamData);

            await interaction.editReply({ content: `✅ **Inscripción Manual Completada**\nEl equipo **${teamName}** (Capitán: ${user.tag}) ha sido inscrito en el torneo.\nReferencia de pago: ${paymentRef}` });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Error al inscribir: ${error.message}` });
        }
        return;
    }

    // =======================================================
    // --- LÓGICA ORIGINAL DEL BOT (CON CORRECCIONES DE FLAGS) ---
    // =======================================================

    // =======================================================
    // --- NUEVA LÓGICA DE INSCRIPCIÓN DE PAGO SIMPLIFICADA ---
    // =======================================================

    if (action === 'register_paid_team_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const [tournamentShortId] = params;
        const teamName = interaction.fields.getTextInputValue('team_name_input');
        const streamLink = interaction.fields.getTextInputValue('stream_link_input') || 'No especificado';

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament) {
            return interaction.editReply({ content: '❌ El torneo no existe.' });
        }



        // --- LÓGICA UNIFICADA: ENVIAR SOLICITUD DE APROBACIÓN AL ADMIN (Igual que Web) ---
        // Construimos el objeto de equipo con los datos del formulario
        const teamData = {
            id: interaction.user.id,
            nombre: teamName,
            eafcTeamName: teamName, // Mismo nombre para ambos
            capitanId: interaction.user.id,
            capitanTag: interaction.user.tag,
            coCaptainId: null,
            coCaptainTag: null,
            logoUrl: interaction.user.displayAvatarURL(),
            twitter: "", // Eliminado
            streamChannel: streamLink,
            paypal: null,
            inscritoEn: new Date(),
            isPaid: true
        };

        try {
            // Guardamos temporalmente en 'pendingPayments' para evitar duplicados inmediatos
            // aunque sendPaymentApprovalRequest ya maneja parte de esto, es bueno tener un registro local db
            if (!tournament.teams.pendingPayments) tournament.teams.pendingPayments = {};
            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.pendingPayments.${interaction.user.id}`]: teamData } }
            );

            // Enviamos la solicitud al canal de admins
            await sendPaymentApprovalRequest(client, tournament, teamData, interaction.user);

            await interaction.editReply({
                content: `✅ **Solicitud enviada a los Administradores.**\n\n` +
                    `Hemos notificado al staff sobre tu interés en inscribir al equipo **${teamName}**.\n` +
                    `Un administrador revisará tu solicitud y te enviará un **Mensaje Directo (DM)** con la información de pago.\n\n` +
                    `⚠️ **Importante:** Asegúrate de tener los mensajes directos abiertos para recibir los datos de pago.`
            });

        } catch (error) {
            console.error('Error al enviar solicitud de aprobación en Discord:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error al procesar tu solicitud. Por favor, inténtalo de nuevo o contacta con un administrador.' });
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

        await db.collection('drafts').updateOne(
            { _id: draft._id },
            {
                $push: {
                    captains: newCaptain,
                    players: {
                        userId: discordId,
                        userName: userName,
                        psnId: psnId,
                        twitter: '',
                        whatsapp: verifiedUser ? verifiedUser.whatsapp : '',
                        primaryPosition: primaryPosition,
                        secondaryPosition: 'NONE',
                        currentTeam: teamName,
                        isCaptain: true,
                        captainId: discordId,
                        strikes: 0,
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
                await db.collection('drafts').updateOne({ _id: draft._id }, { $push: { players: playerData } });

                await interaction.editReply(`✅ ¡Te has inscrito como jugador!`);

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

        const [formatId, type, matchType] = params;
        const nombre = interaction.fields.getTextInputValue('torneo_nombre');
        let shortId = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        // Garantizar unicidad del shortId para evitar E11000 duplicate key error
        let suffix = 1;
        while (await db.collection('tournaments').findOne({ shortId })) {
            suffix++;
            shortId = `${nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${suffix}`;
        }

        const config = { formatId, isPaid: type === 'pago', matchType: matchType };

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

        // Guardamos el estado actual en la DB (por si es el primer reporte)
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { "structure": tournament.structure } });

        if (opponentReport) {
            if (opponentReport.score === reportedResult) {
                // COINCIDENCIA: Finalizamos el partido
                await interaction.editReply({ content: '✅ **Confirmado:** Tu resultado coincide con el del rival. Finalizando el partido...' });

                tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
                const processedMatch = await processMatchResult(client, guild, tournament, matchId, reportedResult);
                await finalizeMatchThread(client, processedMatch, reportedResult);
            } else {
                // CONFLICTO: Avisamos a árbitros
                await interaction.editReply({ content: '❌ **Conflicto:** El resultado que has puesto NO coincide con el del rival. Se ha avisado a los árbitros.' });

                const thread = interaction.channel;
                if (thread.isThread()) {
                    await thread.setName(`⚠️-DISPUTA-${thread.name}`.slice(0, 100));
                    await thread.send({ content: `🚨 <@&${ARBITRO_ROLE_ID}> **DISPUTA DETECTADA**\n\n- <@${reporterId}> (${myTeam.nombre}) dice: **${reportedResult}**\n- <@${opponentReporterId}> (${opponentTeam.nombre}) dice: **${opponentReport.score}**\n\nPor favor, revisad las pruebas.` });
                }
            }
        } else {
            // PRIMER REPORTE: Avisamos y esperamos
            // Si es gratuito, el cronómetro de 3 minutos empieza a contar (gracias a reportedAt).
            const opponentMentions = opponentCaptainIds.map(id => `<@${id}>`).join(' ');
            await interaction.editReply({ content: `✅ Resultado (**${reportedResult}**) guardado. Esperando confirmación del rival...` });
            await interaction.channel.send(`ℹ️ <@${reporterId}> ha reportado el resultado: **${reportedResult}**. ${opponentMentions}, por favor usad el botón para confirmar el vuestro.`);
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

    if (action === 'create_flexible_league_swiss_rounds') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [pendingId] = params;
        const rounds = parseInt(interaction.fields.getTextInputValue('swiss_rounds_input'));

        const pendingData = await db.collection('pending_tournaments').findOne({ pendingId });
        if (!pendingData) {
            return interaction.editReply('❌ Error: No se encontraron los datos del torneo pendiente.');
        }

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
}
