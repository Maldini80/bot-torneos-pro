// --- INICIO DEL ARCHIVO modalHandler.js (VERSIÓN FINAL, COMPLETA Y CORREGIDA) ---

import mongoose from 'mongoose';
import Team from '../../src/models/team.js';
import { getDb, updateBotSettings } from '../../database.js';
import { createNewTournament, updateTournamentConfig, updatePublicMessages, forceResetAllTournaments, addTeamToWaitlist, notifyCastersOfNewTeam, createNewDraft, approveDraftCaptain, updateDraftMainInterface, reportPlayer, notifyTournamentVisualizer, notifyVisualizer } from '../logic/tournamentLogic.js';
import { processVerification, processProfileUpdate } from '../logic/verificationLogic.js';
import { processMatchResult, findMatch, finalizeMatchThread } from '../logic/matchLogic.js';
// --- LÍNEA CORREGIDA Y COMPLETA ---
import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, StringSelectMenuBuilder, ChannelType, PermissionsBitField, TextInputBuilder, TextInputStyle, ModalBuilder } from 'discord.js';
import { CHANNELS, ARBITRO_ROLE_ID, PAYMENT_CONFIG, DRAFT_POSITIONS } from '../../config.js';
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

    // --- LÓGICA DE TICKETS DE VERIFICACIÓN (AÑADIDA) ---
    if (action === 'verification_ticket_submit') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const [platform] = params;
        const gameId = interaction.fields.getTextInputValue('game_id_input').trim();
        const twitter = interaction.fields.getTextInputValue('twitter_input').trim();
        const user = interaction.user;
        const guild = interaction.guild;
        
        const existingTicket = await db.collection('verificationtickets').findOne({ userId: user.id, status: { $in: ['pending', 'claimed'] } });
        if (existingTicket) {
            return interaction.editReply({ content: `❌ Ya tienes un ticket de verificación abierto aquí: <#${existingTicket.channelId}>` });
        }

        try {
            const ticketChannel = await guild.channels.create({
                name: `verificacion-${user.username}`,
                type: ChannelType.GuildText, // <-- ESTO AHORA FUNCIONARÁ
                parent: VERIFICATION_TICKET_CATEGORY_ID,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                ],
                reason: `Ticket de verificación para ${user.tag}`
            });

            const summaryEmbed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTitle('🔎 Nueva Solicitud de Verificación')
                .addFields(
                    { name: 'Usuario', value: `<@${user.id}> (${user.tag})`, inline: false },
                    { name: 'Plataforma Seleccionada', value: platform.toUpperCase(), inline: true },
                    { name: 'ID de Juego Declarado', value: `\`${gameId}\``, inline: true },
                    { name: 'Twitter Declarado', value: `\`${twitter}\``, inline: true }
                );
            
            const claimButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`claim_verification_ticket:${ticketChannel.id}`)
                    .setLabel('Reclamar Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🙋')
            );

            await ticketChannel.send({ embeds: [summaryEmbed], components: [claimButton] });

            const uniqueCode = `${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            
            const instructionsEmbed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('¡Bienvenido a tu Canal de Verificación!')
                .setDescription(`Tu **código de verificación único** es: **\`${uniqueCode}\`**\n\nPor favor, edita la biografía/estado de tu perfil en **${platform.toUpperCase()}** para que contenga este código. Luego, envía una **captura de pantalla completa** en este canal donde se vea claramente tu **ID de Juego** y el **código**.\n\nUn administrador la revisará en breve.`)
                .setFooter({ text: 'Este proceso solo se realiza una vez.' });
            
            await ticketChannel.send({ content: `<@${user.id}>`, embeds: [instructionsEmbed] });

            await db.collection('verificationtickets').insertOne({
                userId: user.id,
                guildId: guild.id,
                channelId: ticketChannel.id,
                platform,
                gameId,
                twitter,
                uniqueCode,
                status: 'pending',
                claimedBy: null,
                createdAt: new Date(),
            });

            await interaction.editReply({ content: `✅ ¡Perfecto! Hemos creado un canal privado para ti. Por favor, continúa aquí: ${ticketChannel.toString()}` });

        } catch (error) {
            console.error("Error al crear el canal de verificación:", error);
            await interaction.editReply({ content: '❌ Hubo un error al crear tu canal de verificación. Asegúrate de que el bot tiene permisos para gestionar canales en la categoría de tickets.' });
        }
        return;
    }

    if (action === 'update_profile_submit_new_value') {
        await processProfileUpdate(interaction);
        return;
    }

    // =======================================================
    // --- LÓGICA ORIGINAL DEL BOT (CON CORRECCIONES DE FLAGS) ---
    // =======================================================

    if (action === 'inscripcion_final_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const [tournamentShortId, platform, teamId] = params;
        const streamUsername = interaction.fields.getTextInputValue('stream_username_input');
        const streamChannelUrl = platform === 'twitch' ? `https://twitch.tv/${streamUsername}` : `https://youtube.com/@${streamUsername}`;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.DATABASE_URL);
        }
        const team = await Team.findById(teamId).lean();

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

    if (action === 'admin_edit_team_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId, captainId] = params;
        
        const newTeamName = interaction.fields.getTextInputValue('team_name_input');
        const newEafcName = interaction.fields.getTextInputValue('eafc_name_input');
        const newTwitter = interaction.fields.getTextInputValue('twitter_input');
        const newStreamUser = interaction.fields.getTextInputValue('stream_user_input');
        
        let newStreamChannel = '';
        if (newStreamUser) {
            newStreamChannel = `https://twitch.tv/${newStreamUser}`;
        }

        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            {
                $set: {
                    [`teams.aprobados.${captainId}.nombre`]: newTeamName,
                    [`teams.aprobados.${captainId}.eafcTeamName`]: newEafcName,
                    [`teams.aprobados.${captainId}.twitter`]: newTwitter,
                    [`teams.aprobados.${captainId}.streamChannel`]: newStreamChannel
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

            if (currentCaptainCount < 8) {
                const teamName = `E-Prueba-${currentCaptainCount + 1}`;
                const captainData = {
                    userId: uniqueId, userName: `TestCaptain#${1000 + i}`, teamName: teamName,
                    streamChannel: 'https://twitch.tv/test', psnId: `Capi-Prueba-${currentCaptainCount + 1}`, eafcTeamName: `EAFC-Test-${currentCaptainCount + 1}`, twitter: 'test_captain', position: "DC"
                };
                
                const captainAsPlayerData = {
                    userId: uniqueId, userName: captainData.userName, psnId: captainData.psnId, twitter: captainData.twitter,
                    primaryPosition: captainData.position, secondaryPosition: 'NONE', currentTeam: teamName, isCaptain: true, captainId: uniqueId
                };
                bulkCaptains.push(captainData);
                bulkPlayers.push(captainAsPlayerData);
            } else {
                const currentPlayerCount = draft.players.length + bulkPlayers.length;
                const primaryPos = positions[Math.floor(Math.random() * positions.length)];
                let secondaryPos = positions[Math.floor(Math.random() * positions.length)];
                if (primaryPos === secondaryPos) {
                   secondaryPos = 'NONE';
                }

                const playerData = {
                    userId: uniqueId,
                    userName: `TestPlayer#${2000 + i}`,
                    psnId: `Jugador-Prueba-${currentPlayerCount + 1}`,
                    twitter: 'test_player',
                    primaryPosition: primaryPos,
                    secondaryPosition: secondaryPos,
                    currentTeam: 'Libre',
                    isCaptain: false,
                    captainId: null
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
        await notifyVisualizer(updatedDraft);
        
        const nonCaptainPlayersAdded = bulkPlayers.length - bulkCaptains.length;
        await interaction.editReply({ content: `✅ ¡Operación completada! Se han añadido **${bulkCaptains.length} capitanes** y **${nonCaptainPlayersAdded} jugadores** de prueba.` });
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
    
    if (action === 'register_draft_captain_modal' || action === 'register_draft_player_modal') {
        await interaction.reply({ content: '⏳ Procesando tu inscripción...', flags: [MessageFlags.Ephemeral] });
        
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
                await notifyVisualizer(updatedDraft);
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
        await notifyTournamentVisualizer(updatedTournament);
     
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
