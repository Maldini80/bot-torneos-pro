// src/handlers/buttonHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const Team = require('../models/team.js');
const mongoose = require('mongoose');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const VPGUser = require('../models/user.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');
const Ticket = require('../models/ticket.js');
const TicketConfig = require('../models/ticketConfig.js');
const PendingTeam = require('../models/pendingTeam.js');
const t = require('../utils/translator.js');

const POSITION_KEYS = ['GK', 'CB', 'WB', 'CDM', 'CM', 'CAM', 'ST'];

// ===========================================================================
// =================== FUNCIONES DE UTILIDAD (NO CAMBIAN) ====================
// ===========================================================================

async function sendPaginatedPlayerMenu(interaction, members, page) {
    const member = interaction.member; // Necesario para obtener el idioma
    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(members.length / ITEMS_PER_PAGE);
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentMembers = members.slice(startIndex, endIndex);
    if (currentMembers.length === 0) { return interaction.editReply({ content: t('errorNoEligibleMembers', member), components: [] }); }

    const memberOptions = currentMembers.map(m => ({ label: m.user.username, description: m.nickname || m.user.id, value: m.id }));

    const placeholder = t('invitePlayerMenuPlaceholder', member)
        .replace('{currentPage}', page + 1)
        .replace('{totalPages}', totalPages);

    const selectMenu = new StringSelectMenuBuilder().setCustomId('invite_player_select').setPlaceholder(placeholder).addOptions(memberOptions);

    // Dejamos los botones de navegación sin traducir ya que son universales
    const navigationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paginate_invitePlayer_${page - 1}`).setLabel(`◀️ ${t('paginationPrevious', member)}`).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`paginate_invitePlayer_${page + 1}`).setLabel(`${t('paginationNext', member)} ▶️`).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
    );
    const components = [new ActionRowBuilder().addComponents(selectMenu)];
    if (totalPages > 1) { components.push(navigationRow); }
    await interaction.editReply({ content: t('invitePlayerMenuHeader', member), components });
}

async function sendPaginatedTeamMenu(interaction, teams, baseCustomId, paginationId, page, contentMessage) {
    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(teams.length / ITEMS_PER_PAGE);
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentTeams = teams.slice(startIndex, endIndex);
    if (currentTeams.length === 0) { return interaction.editReply({ content: t('paginationNoTeamsOnPage', interaction.member), components: [] }); }
    const teamOptions = currentTeams.map(t => ({ 
        label: `${t.name} (${t.abbreviation})`.substring(0, 100), 
        description: `ELO: ${t.elo || 1000}`,
        value: t._id.toString() 
    }));
    const placeholder = t('paginationSelectTeamPlaceholder', interaction.member).replace('{currentPage}', page + 1).replace('{totalPages}', totalPages);
    const selectMenu = new StringSelectMenuBuilder().setCustomId(baseCustomId).setPlaceholder(placeholder).addOptions(teamOptions);
    const navigationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paginate_${paginationId}_${page - 1}`).setLabel(`◀️ ${t('paginationPrevious', interaction.member)}`).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`paginate_${paginationId}_${page + 1}`).setLabel(`${t('paginationNext', interaction.member)} ▶️`).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
    );
    const components = [new ActionRowBuilder().addComponents(selectMenu)];
    if (totalPages > 1) { components.push(navigationRow); }
    if (interaction.deferred || interaction.replied) { await interaction.editReply({ content: contentMessage, components }); }
    else { await interaction.reply({ content: contentMessage, components, ephemeral: true }); }
}

async function updatePanelMessage(client, panelId) {
    try {
        const panel = await AvailabilityPanel.findById(panelId).populate('teamId').lean();
        if (!panel) return;
        const channel = await client.channels.fetch(panel.channelId);
        const webhook = await getOrCreateWebhook(channel, client);
        const hostTeam = panel.teamId;
        const hasConfirmedMatch = panel.timeSlots.some(s => s.status === 'CONFIRMED');
        const pendingCount = panel.timeSlots.reduce((acc, slot) => acc + (slot.pendingChallenges?.length || 0), 0);
        let panelTitle, panelColor;
        if (hasConfirmedMatch) { panelTitle = `Panel de Amistosos de ${hostTeam.name}`; panelColor = "Green"; }
        else if (pendingCount > 0) { panelTitle = `Buscando Rival - ${hostTeam.name} (${pendingCount} Petición(es))`; panelColor = "Orange"; }
        else { panelTitle = `Buscando Rival - ${hostTeam.name} (Disponible)`; panelColor = "Greyple"; }
        let description = `**Anfitrión:** ${hostTeam.name}\n**Contacto:** <@${panel.postedById}>`;
        if (panel.leagues && panel.leagues.length > 0) { description += `\n**Filtro de liga:** \`${panel.leagues.join(', ')}\``; }
        const embed = new EmbedBuilder().setTitle(panelTitle).setColor(panelColor).setDescription(description).setThumbnail(hostTeam.logoUrl);
        const components = [];
        let currentRow = new ActionRowBuilder();
        const timeSlots = panel.timeSlots.sort((a, b) => a.time.localeCompare(b.time));
        for (const slot of timeSlots) {
            if (slot.status === 'CONFIRMED') {
                const challengerTeam = await Team.findById(slot.challengerTeamId).lean();
                if (!challengerTeam) continue;
                const contactButton = new ButtonBuilder().setCustomId(`contact_opponent_${panel.teamId._id}_${challengerTeam._id}`).setLabel(`Contactar`).setStyle(ButtonStyle.Primary).setEmoji('💬');
                const abandonButton = new ButtonBuilder().setCustomId(`abandon_challenge_${panel._id}_${slot.time}`).setLabel('Abandonar').setStyle(ButtonStyle.Danger).setEmoji('❌');
                const matchInfoButton = new ButtonBuilder().setCustomId(`match_info_${slot.time}`).setLabel(`vs ${challengerTeam.name} (${slot.time})`).setStyle(ButtonStyle.Success).setDisabled(true);
                if (currentRow.components.length > 0) { components.push(currentRow); currentRow = new ActionRowBuilder(); }
                currentRow.addComponents(matchInfoButton, contactButton, abandonButton);
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
                continue;
            } else {
                const label = slot.time === 'INSTANT' ? `⚔️ Desafiar Ahora` : `⚔️ Desafiar (${slot.time})`;
                const pendingText = slot.pendingChallenges.length > 0 ? ` (${slot.pendingChallenges.length} ⏳)` : '';
                const challengeButton = new ButtonBuilder().setCustomId(`challenge_slot_${panel._id}_${slot.time}`).setLabel(label + pendingText).setStyle(ButtonStyle.Success);
                if (currentRow.components.length >= 5) { components.push(currentRow); currentRow = new ActionRowBuilder(); }
                currentRow.addComponents(challengeButton);
            }
        }
        if (currentRow.components.length > 0) { components.push(currentRow); }
        if (pendingCount > 0) {
            const cancelRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cancel_all_challenges_${panel._id}`).setLabel('Cancelar Todas las Peticiones').setStyle(ButtonStyle.Danger));
            if (components.length < 5) { components.push(cancelRow); }
        }
        if (components.length > 5) { components.length = 5; }
        await webhook.editMessage(panel.messageId, { username: hostTeam.name, avatarURL: hostTeam.logoUrl, embeds: [embed], components });
    } catch (error) {
        if (error.code !== 10008) console.error("Error fatal al actualizar el panel de amistosos:", error);
    }
}

async function getOrCreateWebhook(channel, client) {
    const webhookName = 'VPG Bot Amistosos';
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.name === webhookName);
    if (!webhook) { webhook = await channel.createWebhook({ name: webhookName, avatar: client.user.displayAvatarURL() }); }
    return webhook;
}

async function sendApprovalRequest(interaction, client, { vpgUsername, teamName, teamAbbr, teamTwitter, leagueName, logoUrl }) {
    const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
    if (!approvalChannelId) return;
    const approvalChannel = await client.channels.fetch(approvalChannelId).catch(() => null);
    if (!approvalChannel) return;
    const safeLeagueName = leagueName.replace(/\s/g, '_');
    const embed = new EmbedBuilder().setTitle('📝 Nueva Solicitud de Registro').setColor('Orange').setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).setThumbnail(logoUrl && logoUrl.startsWith('http') ? logoUrl : null)
        .addFields(
            { name: 'Usuario VPG', value: vpgUsername }, { name: 'Nombre del Equipo', value: teamName }, { name: 'Abreviatura', value: teamAbbr },
            { name: 'Twitter del Equipo', value: teamTwitter || 'No especificado' }, { name: 'URL del Logo', value: `[Ver Logo](${logoUrl})` }
        ).setTimestamp();

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`approve_team_select_${interaction.user.id}`)
            .setPlaceholder('Elige la liga para APROBAR este equipo')
            .addOptions([
                { label: '💎 Liga DIAMOND (1550+ ELO)', value: '1550_DIAMOND', description: 'Empieza con 1550 Puntos' },
                { label: '👑 Liga GOLD (1300-1549 ELO)', value: '1300_GOLD', description: 'Empieza con 1300 Puntos' },
                { label: '⚙️ Liga SILVER (1000-1299 ELO)', value: '1000_SILVER', description: 'Empieza con 1000 Puntos' },
                { label: '🥉 Liga BRONZE (<1000 ELO)', value: '700_BRONZE', description: 'Empieza con 700 Puntos' }
            ])
    );

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`reject_request_${interaction.user.id}`)
            .setLabel('Rechazar')
            .setStyle(ButtonStyle.Danger)
    );

    await approvalChannel.send({ content: `**Solicitante:** <@${interaction.user.id}>`, embeds: [embed], components: [selectRow, buttonRow] });
}


// ===========================================================================
// ========================== MANEJADOR PRINCIPAL ============================
// ===========================================================================

const handler = async (client, interaction) => {
    const { customId, user } = interaction;

    if (customId === 'start_player_registration') {
        await interaction.deferReply({ ephemeral: true });
        let member = interaction.member;
        let guild = interaction.guild; // <== AÑADE ESTA LÍNEA
        if (!member) {
            try {
                guild = await client.guilds.fetch(process.env.GUILD_ID); // <== QUITA EL 'const'
                member = await guild.members.fetch(user.id);
            } catch (e) {
                return interaction.editReply({ content: 'No pude encontrarte en el servidor. Asegúrate de estar dentro antes de registrarte.' });
            }
        }

        const platformMenu = new StringSelectMenuBuilder()
            .setCustomId('registration_select_platform_step1')
            .setPlaceholder(t('registrationPlatformPlaceholder', member))
            .addOptions([
                { label: t('platformPlayStation', member), value: 'psn', emoji: '🎮' },
                { label: t('platformXbox', member), value: 'xbox', emoji: '❎' },
                { label: t('platformPC', member), value: 'pc', emoji: '🖥️' },
            ]);

        const row = new ActionRowBuilder().addComponents(platformMenu);

        await interaction.editReply({ content: t('registrationPlatformStep1Title', member), components: [row] });

        return;
    }


    // ===========================================================================
    // =================== LÓGICA DE INTERACCIONES EN MD =========================
    // ===========================================================================
    if (!interaction.inGuild()) {
        await interaction.deferUpdate();
        const { message } = interaction;

        if (customId.startsWith('accept_challenge_') || customId.startsWith('reject_challenge_')) {
            // ESTE CÓDIGO YA ESTÁ TRADUCIDO DE LA RESPUESTA ANTERIOR
            const parts = customId.split('_');
            const action = parts[0];
            const panelId = parts[2];
            const time = parts[3];
            const challengeId = parts[4];

            const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
            if (!panel) return interaction.editReply({ content: 'Este panel de amistosos ya no existe.', components: [] });

            const slot = panel.timeSlots.find(s => s.time === time);
            if (!slot) {
                await message.edit({ content: 'Este horario de partido ya no existe en el panel.', components: [] });
                return interaction.followUp({ content: 'El horario ya no existe.', ephemeral: true });
            }

            // Necesitamos el guild para poder obtener el 'member' del que responde
            const guild = await client.guilds.fetch(panel.guildId);
            const hostMember = await guild.members.fetch(user.id);

            if (slot.status === 'CONFIRMED') {
                await message.edit({ content: t('errorChallengeExpired', hostMember), components: [] });
                return interaction.followUp({ content: t('errorChallengeExpired', hostMember), ephemeral: true });
            }

            const challengeIndex = slot.pendingChallenges.findIndex(c => c._id.toString() === challengeId);
            if (challengeIndex === -1) {
                await message.edit({ content: 'Esta petición de desafío ya no es válida o ya fue gestionada.', components: [] });
                return interaction.followUp({ content: 'La petición ya no es válida.', ephemeral: true });
            }

            const [acceptedChallenge] = slot.pendingChallenges.splice(challengeIndex, 1);
            const rejectedChallenges = slot.pendingChallenges;
            slot.pendingChallenges = [];

            if (action === 'accept') {
                slot.status = 'CONFIRMED';
                slot.challengerTeamId = acceptedChallenge.teamId;

                const winnerTeam = await Team.findById(acceptedChallenge.teamId);
                const winnerUser = await client.users.fetch(acceptedChallenge.userId);
                const winnerMember = await guild.members.fetch(acceptedChallenge.userId);

                const acceptedNotification = t('challengeAcceptedNotification', winnerMember)
                    .replace('{hostTeamName}', panel.teamId.name)
                    .replace('{time}', time);
                await winnerUser.send(acceptedNotification).catch(() => { });

                const hostConfirmation = t('hostAcceptedConfirmation', hostMember).replace('{challengerTeamName}', winnerTeam.name);
                await message.edit({ content: hostConfirmation, components: [], embeds: [] });

                for (const loser of rejectedChallenges) {
                    const loserUser = await client.users.fetch(loser.userId).catch(() => null);
                    if (loserUser) {
                        const loserMember = await guild.members.fetch(loser.userId);
                        const lostNotification = t('challengeLostNotification', loserMember)
                            .replace('{hostTeamName}', panel.teamId.name)
                            .replace('{time}', time);
                        await loserUser.send(lostNotification).catch(() => { });
                    }
                }

                const challengerPanel = await AvailabilityPanel.findOne({ teamId: winnerTeam._id, panelType: 'SCHEDULED' });
                if (challengerPanel) {
                    const challengerSlot = challengerPanel.timeSlots.find(s => s.time === time);
                    if (challengerSlot) {
                        challengerSlot.status = 'CONFIRMED';
                        challengerSlot.challengerTeamId = panel.teamId._id;
                        challengerSlot.pendingChallenges = [];
                        await challengerPanel.save();
                        await updatePanelMessage(client, challengerPanel._id);
                    }
                }

            } else { // REJECT
                await message.edit({ content: t('hostRejectedConfirmation', hostMember), components: [], embeds: [] });
                const rejectedUser = await client.users.fetch(acceptedChallenge.userId);
                const rejectedMember = await guild.members.fetch(acceptedChallenge.userId);
                const rejectedNotification = t('challengeRejectedNotification', rejectedMember)
                    .replace('{hostTeamName}', panel.teamId.name)
                    .replace('{time}', time);
                await rejectedUser.send(rejectedNotification).catch(() => { });
            }

            await panel.save();
            await updatePanelMessage(client, panel._id);

        } else if (customId.startsWith('accept_application_') || customId.startsWith('reject_application_')) {
            const applicationId = customId.split('_')[2];
            const application = await PlayerApplication.findById(applicationId).populate('teamId');
            if (!application || application.status !== 'pending') return interaction.editReply({ content: 'This application is no longer valid or has already been handled. / Esta solicitud ya no es válida o ya ha sido gestionada.', components: [], embeds: [] });

            const guild = await client.guilds.fetch(application.teamId.guildId);
            const applicantUser = await client.users.fetch(application.userId).catch(() => null);
            const managerMember = await guild.members.fetch(user.id);

            if (customId.startsWith('accept_application_')) {
                application.status = 'accepted';
                if (applicantUser) {
                    const applicantMember = await guild.members.fetch(application.userId).catch(() => null);
                    if (applicantMember) {
                        await applicantMember.roles.add(process.env.PLAYER_ROLE_ID);
                        await applicantMember.setNickname(`${application.teamId.abbreviation} ${applicantUser.username}`).catch(() => { });
                        application.teamId.players.push(applicantUser.id);

                        const notification = t('applicationAcceptedNotification', applicantMember).replace('{teamName}', application.teamId.name);
                        await applicantUser.send(notification).catch(() => { });
                    }
                }
                const confirmation = t('managerAcceptedPlayer', managerMember).replace('{playerName}', applicantUser ? applicantUser.tag : 'a user');
                await interaction.editReply({ content: confirmation, components: [], embeds: [] });
            } else {
                application.status = 'rejected';
                if (applicantUser) {
                    const applicantMember = await guild.members.fetch(application.userId).catch(() => null);
                    if (applicantMember) {
                        const notification = t('applicationRejectedNotification', applicantMember).replace('{teamName}', application.teamId.name);
                        await applicantUser.send(notification).catch(() => { });
                    }
                }
                const confirmation = t('managerRejectedPlayer', managerMember).replace('{playerName}', applicantUser ? applicantUser.tag : 'a user');
                await interaction.editReply({ content: confirmation, components: [], embeds: [] });
            }
            await application.teamId.save();
            await application.save();

        } else if (customId.startsWith('accept_invite_') || customId.startsWith('reject_invite_')) {
            const parts = customId.split('_');
            const action = parts[0];
            const teamId = parts[2];
            const playerId = parts[3];

            if (interaction.user.id !== playerId) {
                return interaction.followUp({ content: 'This invitation is not for you. / Esta invitación no es para ti.', ephemeral: true });
            }

            const team = await Team.findById(teamId);
            if (!team) {
                return interaction.editReply({ content: 'This team no longer exists. / Este equipo ya no existe.', components: [], embeds: [] });
            }

            const guild = await client.guilds.fetch(team.guildId);
            const manager = await client.users.fetch(team.managerId).catch(() => null);
            const managerMember = manager ? await guild.members.fetch(team.managerId).catch(() => null) : null;
            const playerMember = await guild.members.fetch(playerId).catch(() => null);


            if (action === 'accept') {
                if (!playerMember) {
                    return interaction.editReply({ content: 'It seems you are no longer in the team\'s server. / Parece que ya no estás en el servidor del equipo.', components: [], embeds: [] });
                }

                const existingTeam = await Team.findOne({ guildId: team.guildId, $or: [{ managerId: playerId }, { captains: playerId }, { players: playerId }] });
                if (existingTeam) {
                    const errorMessage = t('errorAlreadyInTeam', playerMember).replace('{teamName}', existingTeam.name);
                    return interaction.editReply({ content: errorMessage, components: [], embeds: [] });
                }

                team.players.push(playerId);
                await team.save();

                await playerMember.roles.add(process.env.PLAYER_ROLE_ID);
                await playerMember.setNickname(`${team.abbreviation} ${playerMember.user.username}`).catch(() => { });

                if (manager && managerMember) {
                    const notification = t('playerJoinedNotification', managerMember).replace('{playerName}', playerMember.user.tag).replace('{teamName}', team.name);
                    await manager.send(notification).catch(() => { });
                }

                const successMessage = t('applicationAcceptedNotification', playerMember).replace('{teamName}', team.name);
                await interaction.editReply({ content: successMessage, components: [], embeds: [] });

            } else {
                if (manager && managerMember) {
                    const notification = t('playerRejectedNotification', managerMember).replace('{playerName}', interaction.user.tag).replace('{teamName}', team.name);
                    await manager.send(notification).catch(() => { });
                }
                const successMessage = t('applicationRejectedNotification', playerMember).replace('{teamName}', team.name);
                await interaction.editReply({ content: successMessage, components: [], embeds: [] });
            }
        }
        return;
    }

    // ===========================================================================
    // =================== LÓGICA DE INTERACCIONES EN GUILD ======================
    // ===========================================================================
    
    // --- MANEJO DE APROBACIÓN / RECHAZO DE VINCULACIÓN EA ---
    if (customId.startsWith('approve_ealink_')) {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida. Solo para administradores.', ephemeral: true });

        const parts = customId.split('_');
        const teamId = parts[2];
        const eaClubId = parts[3];
        const eaPlatform = parts[4];
        const eaClubName = parts.slice(5).join('_') || 'Desconocido';

        const team = await Team.findById(teamId);
        if (!team) return interaction.reply({ content: 'El equipo ya no existe.', ephemeral: true });

        team.eaClubId = eaClubId;
        team.eaClubName = eaClubName;
        team.eaPlatform = eaPlatform;
        await team.save();

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('Green')
            .setTitle('✅ Vinculación con EA Aprobada');

        await interaction.update({ content: `Aprobado por <@${interaction.user.id}>`, embeds: [embed], components: [] });
    }

    if (customId.startsWith('reject_ealink_')) {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida. Solo para administradores.', ephemeral: true });

        const parts = customId.split('_');
        const teamId = parts[2];

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('Red')
            .setTitle('❌ Vinculación con EA Rechazada');

        await interaction.update({ content: `Rechazado por <@${interaction.user.id}>`, embeds: [embed], components: [] });
    }

    const { member, guild } = interaction;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has('1393505777443930183') || member.roles.cache.has(process.env.APPROVER_ROLE_ID);

    if (customId === 'admin_create_team_button') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });

        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId('admin_select_manager_for_creation')
            .setPlaceholder('Selecciona al futuro mánager del equipo')
            .setMinValues(1)
            .setMaxValues(1);

        await interaction.editReply({
            content: '**Paso 1 de 3:** Selecciona al miembro del servidor que será el Mánager de este nuevo equipo.',
            components: [new ActionRowBuilder().addComponents(userSelectMenu)]
        });
        return;
    }

    if (customId.startsWith('admin_add_captains_') || customId.startsWith('admin_add_players_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });

        const isAddingCaptains = customId.startsWith('admin_add_captains_');
        const teamId = customId.substring(customId.lastIndexOf('_') + 1);

        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId(`admin_select_members_${isAddingCaptains ? 'captains' : 'players'}_${teamId}`)
            .setPlaceholder(`Selecciona los ${isAddingCaptains ? 'capitanes' : 'jugadores'} a añadir`)
            .setMinValues(1)
            .setMaxValues(25);

        await interaction.editReply({
            content: `Selecciona los **${isAddingCaptains ? 'capitanes' : 'jugadores'}** que quieres añadir al equipo desde el menú de abajo.`,
            components: [new ActionRowBuilder().addComponents(userSelectMenu)]
        });
        return;
    }
    if (customId.startsWith('admin_change_manager_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });

        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'Equipo no encontrado.' });

        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId(`admin_select_new_manager_${teamId}`)
            .setPlaceholder('Selecciona al miembro que será el nuevo mánager')
            .setMinValues(1)
            .setMaxValues(1);

        await interaction.editReply({
            content: `Estás a punto de cambiar el mánager del equipo **${team.name}**. El mánager actual es <@${team.managerId}>.\n\nPor favor, selecciona al nuevo mánager en el menú de abajo.`,
            components: [new ActionRowBuilder().addComponents(userSelectMenu)]
        });
        return;
    }
    if (customId.startsWith('admin_set_logo_custom_')) {
        const teamId = customId.split('_')[4];
        const modal = new ModalBuilder()
            .setCustomId(`admin_submit_logo_modal_${teamId}`)
            .setTitle('Añadir Logo Personalizado');
        const logoUrlInput = new TextInputBuilder().setCustomId('logoUrl').setLabel("URL de la imagen del logo").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://i.imgur.com/logo.png');
        modal.addComponents(new ActionRowBuilder().addComponents(logoUrlInput));
        await interaction.showModal(modal);
        return;
    }

    if (customId.startsWith('admin_continue_no_logo_')) {
        const teamId = customId.split('_')[4];
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_add_captains_${teamId}`).setLabel('Añadir Capitanes').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`admin_add_players_${teamId}`).setLabel('Añadir Jugadores').setStyle(ButtonStyle.Success)
        );
        await interaction.update({
            content: `✅ Logo por defecto asignado. Ahora puedes añadir miembros a la plantilla.`,
            components: [row]
        });
        return;
    }

    if (customId.startsWith('paginate_')) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        const parts = customId.split('_');
        const paginationId = parts[1];
        const newPage = parseInt(parts[2], 10);

        // --- LÓGICA AÑADIDA PARA LA PAGINACIÓN DE JUGADORES ---
        if (paginationId === 'invitePlayer') {
            const allMembers = guild.members.cache;
            const teamsInServer = await Team.find({ guildId: guild.id }).select('managerId captains players').lean();
            const playersInTeams = new Set(teamsInServer.flatMap(t => [t.managerId, ...t.captains, ...t.players]));
            const eligibleMembers = allMembers.filter(m => !m.user.bot && !playersInTeams.has(m.id));
            const sortedMembers = Array.from(eligibleMembers.values()).sort((a, b) => a.user.username.localeCompare(b.user.username));
            await sendPaginatedPlayerMenu(interaction, sortedMembers, newPage);
        }
        // --- FIN DE LA LÓGICA AÑADIDA ---
        else {
            let teams, baseCustomId, contentMessage;
            if (paginationId === 'view') {
                teams = await Team.find({ guildId: guild.id }).sort({ name: 1 }).lean();
                baseCustomId = 'view_team_roster_select';
                contentMessage = 'Elige un equipo para ver su plantilla:';
            } else if (paginationId === 'apply') {
                teams = await Team.find({ guildId: guild.id, recruitmentOpen: true }).sort({ name: 1 }).lean();
                baseCustomId = 'apply_to_team_select';
                contentMessage = 'Selecciona el equipo al que quieres aplicar:';
            } else if (paginationId === 'manage') {
                teams = await Team.find({ guildId: interaction.guildId }).sort({ name: 1 }).lean();
                baseCustomId = 'admin_select_team_to_manage';
                contentMessage = 'Selecciona el equipo que deseas gestionar:';
            }
            if (teams) {
                await sendPaginatedTeamMenu(interaction, teams, baseCustomId, paginationId, newPage, contentMessage);
            }
        }
        return;
    }

    // ===========================================================================
    // =================== LÓGICA DE PANELES Y BOTONES ===========================
    // ===========================================================================


    if (customId === 'manager_actions_button') {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
        if (team) {
            // Ahora también traducimos el mensaje de error
            return interaction.editReply({ content: t('errorAlreadyManager', member) });
        }

        // Usamos la función 't' para obtener los textos en el idioma del usuario
        const subMenuEmbed = new EmbedBuilder()
            .setTitle(t('managerActionsTitle', member))
            .setDescription(t('managerActionsDescription', member))
            .setColor('Green');

        const subMenuRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('request_manager_role_button')
                .setLabel(t('registerTeamButton', member))
                .setStyle(ButtonStyle.Success)
        );

        return interaction.editReply({ embeds: [subMenuEmbed], components: [subMenuRow] });
    }

    if (customId === 'request_manager_role_button') {
        const existingTeam = await Team.findOne({ $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }], guildId: guild.id });
        if (existingTeam) {
            const errorMessage = t('errorAlreadyInTeam', member).replace('{teamName}', existingTeam.name);
            return interaction.reply({ content: errorMessage, ephemeral: true });
        }

        const modalTitle = t('registerModalTitle', member).replace('{leagueName}', 'PENDIENTE');
        const modal = new ModalBuilder().setCustomId(`manager_request_modal_PENDIENTE`).setTitle(modalTitle);

        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel(t('vpgUsernameLabel', member)).setStyle(TextInputStyle.Short).setRequired(true);
        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel(t('teamNameLabel', member)).setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel(t('teamAbbrLabel', member)).setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        const teamTwitterInput = new TextInputBuilder().setCustomId('teamTwitterInput').setLabel(t('teamTwitterLabel', member)).setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(vpgUsernameInput),
            new ActionRowBuilder().addComponents(teamNameInput),
            new ActionRowBuilder().addComponents(teamAbbrInput),
            new ActionRowBuilder().addComponents(teamTwitterInput)
        );

        return interaction.showModal(modal);
    }

    if (customId.startsWith('ask_logo_yes_')) {
        const pendingTeamId = customId.split('_')[3];
        // --- CORRECCIÓN: Usamos el traductor ---
        const modal = new ModalBuilder()
            .setCustomId(`final_logo_submit_${pendingTeamId}`)
            .setTitle(t('finalLogoModalTitle', member));
        const teamLogoUrlInput = new TextInputBuilder()
            .setCustomId('teamLogoUrlInput')
            .setLabel(t('logoUrlLabel', member))
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(t('logoUrlPlaceholder', member));
        modal.addComponents(new ActionRowBuilder().addComponents(teamLogoUrlInput));
        return interaction.showModal(modal);
    }

    if (customId.startsWith('ask_logo_no_')) {
        await interaction.deferReply({ ephemeral: true });
        const pendingTeamId = customId.split('_')[3];

        const pendingTeam = await PendingTeam.findById(pendingTeamId);
        if (!pendingTeam || pendingTeam.userId !== user.id) {
            return interaction.editReply({ content: 'Esta solicitud ha expirado o no es tuya.', components: [] });
        }

        const defaultLogo = 'https://i.imgur.com/V4J2Fcf.png';
        await sendApprovalRequest(interaction, client, { ...pendingTeam.toObject(), logoUrl: defaultLogo });
        await PendingTeam.findByIdAndDelete(pendingTeamId);

        // --- CORRECCIÓN: Usamos el traductor ---
        return interaction.editReply({ content: t('requestSentDefaultLogo', member), components: [] });
    }

    // ===========================================================================
    // =================== BLOQUE DE APROBACIÓN/RECHAZO CORREGIDO =================
    // ===========================================================================
    if (customId.startsWith('approve_request_')) {
        await interaction.deferUpdate();
        const esAprobador = member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!esAprobador) return interaction.followUp({ content: 'No tienes permisos para esta acción.', ephemeral: true });

        const parts = customId.split('_');
        const applicantId = parts[2];
        const leagueName = parts.slice(3).join('_').replace(/_/g, ' ');

        const originalEmbed = interaction.message.embeds[0];
        if (!originalEmbed) return interaction.followUp({ content: 'Error: No se pudo encontrar el embed de la solicitud original.', ephemeral: true });

        const teamName = originalEmbed.fields.find(f => f.name === 'Nombre del Equipo').value;
        const teamAbbr = originalEmbed.fields.find(f => f.name === 'Abreviatura').value;
        const teamTwitter = originalEmbed.fields.find(f => f.name === 'Twitter del Equipo').value;
        const logoUrl = originalEmbed.thumbnail ? originalEmbed.thumbnail.url : 'https://i.imgur.com/V4J2Fcf.png';

        const applicantMember = await guild.members.fetch(applicantId).catch(() => null);
        if (!applicantMember) return interaction.followUp({ content: `El usuario solicitante ya no está en el servidor.`, ephemeral: true });

        const existingTeam = await Team.findOne({ $or: [{ name: teamName }, { managerId: applicantId }], guildId: guild.id });
        if (existingTeam) return interaction.followUp({ content: `Error: Ya existe un equipo con el nombre "${teamName}" o el usuario ya es mánager.`, ephemeral: true });

        const newTeam = new Team({
            name: teamName,
            abbreviation: teamAbbr,
            guildId: guild.id,
            league: leagueName,
            logoUrl: logoUrl,
            twitterHandle: teamTwitter === 'No especificado' ? null : teamTwitter,
            managerId: applicantId,
        });
        await newTeam.save();

        await applicantMember.roles.add(process.env.MANAGER_ROLE_ID);
        await applicantMember.roles.add(process.env.PLAYER_ROLE_ID);
        await applicantMember.setNickname(`|MG| ${teamAbbr} ${applicantMember.user.username}`).catch(err => console.log(`No se pudo cambiar apodo: ${err.message}`));

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ components: [disabledRow] });

        try {
            // Usamos el traductor para la guía del mánager
            const managerGuideEmbed = new EmbedBuilder()
                .setTitle(t('managerGuideTitle', applicantMember).replace('{teamName}', teamName))
                .setColor('Gold')
                .setImage('https://i.imgur.com/KjamtCg.jpeg')
                .setDescription(t('managerGuideDescription', applicantMember))
                .addFields(
                    { name: t('managerGuideStep1Title', applicantMember), value: t('managerGuideStep1Value', applicantMember) },
                    { name: t('managerGuideStep2Title', applicantMember), value: t('managerGuideStep2Value', applicantMember) },
                    { name: t('managerGuideStep3Title', applicantMember), value: t('managerGuideStep3Value', applicantMember) }
                );
            await applicantMember.send({ embeds: [managerGuideEmbed] });
        } catch (dmError) {
            console.log(`AVISO: No se pudo enviar el MD de guía al nuevo mánager ${applicantMember.user.tag}.`);
        }

        return interaction.followUp({ content: `✅ Equipo **${teamName}** creado. ${applicantMember.user.tag} es ahora Mánager.`, ephemeral: true });
    }
    if (customId.startsWith('reject_request_')) {
        await interaction.deferUpdate();
        const esAprobador = member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!esAprobador) return interaction.followUp({ content: 'No tienes permisos para esta acción.', ephemeral: true });

        const applicantId = customId.split('_')[2];
        const applicant = await guild.members.fetch(applicantId).catch(() => null);

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ components: [disabledRow] });

        if (applicant) {
            await applicant.send('Lo sentimos, tu solicitud para registrar un equipo ha sido rechazada por un administrador.').catch(() => { });
        }

        return interaction.followUp({ content: `Solicitud de ${applicant ? applicant.user.tag : 'un usuario'} rechazada.`, ephemeral: true });
    }
    // ===========================================================================
    // ================== BLOQUE DE CÓDIGO FALTANTE (AHORA PRESENTE) ==============
    // ===========================================================================
    if (customId.startsWith('promote_player_') || customId.startsWith('demote_captain_') || customId.startsWith('kick_player_') || customId.startsWith('toggle_mute_player_')) {
        await interaction.deferUpdate();

        const targetId = customId.substring(customId.lastIndexOf('_') + 1);

        let team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: targetId }, { captains: targetId }, { players: targetId }] });

        if (!team) return interaction.editReply({ content: 'No se pudo encontrar el equipo del jugador seleccionado.', components: [] });

        const isManager = team.managerId === user.id;
        const isCaptain = team.captains.includes(user.id);
        if (!isAdmin && !isManager && !isCaptain) {
            return interaction.editReply({ content: 'No tienes permisos para gestionar este equipo.', components: [] });
        }

        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!targetMember) return interaction.editReply({ content: 'Miembro no encontrado en el servidor.', components: [] });

        const canManage = isAdmin || isManager;
        const isTargetCaptain = team.captains.includes(targetId);

        if (customId.startsWith('kick_player_')) {
            if (isTargetCaptain && !canManage) return interaction.editReply({ content: 'Un capitán no puede expulsar a otro capitán.', components: [] });
            if (team.managerId === targetId) return interaction.editReply({ content: 'No puedes expulsar al mánager del equipo.', components: [] });

            // FORZAMOS LA ESCRITURA EN DB (Evitar fallo Mongoose de reasignación)
            const pullResult = await mongoose.connection.client.db('test').collection('teams').updateOne(
                { _id: team._id },
                { $pull: { players: targetId, captains: targetId } }
            );
            console.log(`[VPG KICK] $pull ejecutado para ${targetId} en equipo ${team.name} (_id: ${team._id}). matchedCount: ${pullResult.matchedCount}, modifiedCount: ${pullResult.modifiedCount}`);

            await targetMember.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => { });
            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(targetMember.user.username).catch(() => { });

            const successMessage = t('playerKicked', member).replace('{playerName}', targetMember.user.username);
            await interaction.editReply({ content: successMessage, components: [] });

        } else if (customId.startsWith('promote_player_')) {
            if (!canManage) return interaction.editReply({ content: 'Solo el Mánager o un Administrador pueden ascender jugadores.', components: [] });
            await mongoose.connection.client.db('test').collection('teams').updateOne(
                { _id: team._id },
                { $pull: { players: targetId }, $push: { captains: targetId } }
            );

            await targetMember.roles.remove(process.env.PLAYER_ROLE_ID).catch(() => { });
            await targetMember.roles.add(process.env.CAPTAIN_ROLE_ID).catch(() => { });
            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`|C| ${team.abbreviation} ${targetMember.user.username}`).catch(() => { });

            try {
                const captainGuideEmbed = new EmbedBuilder()
                    .setTitle(t('captainGuideTitle', targetMember).replace('{teamName}', team.name))
                    .setColor('Blue')
                    .setDescription(t('captainGuideDescription', targetMember))
                    .addFields(
                        { name: t('captainGuideResponsibilitiesTitle', targetMember), value: t('captainGuideResponsibilitiesValue', targetMember) },
                        { name: t('captainGuideLimitsTitle', targetMember), value: t('captainGuideLimitsValue', targetMember) }
                    );
                await targetMember.send({ embeds: [captainGuideEmbed] });
            } catch (dmError) {
                console.log(`AVISO: No se pudo enviar el MD de guía al nuevo capitán ${targetMember.user.tag}.`);
            }

            const successMessage = t('playerPromoted', member).replace('{playerName}', targetMember.user.username);
            await interaction.editReply({ content: successMessage, components: [] });

        } else if (customId.startsWith('demote_captain_')) {
            if (!canManage) return interaction.editReply({ content: 'Solo el Mánager o un Administrador pueden degradar capitanes.', components: [] });
            await mongoose.connection.client.db('test').collection('teams').updateOne(
                { _id: team._id },
                { $pull: { captains: targetId }, $push: { players: targetId } }
            );
            await targetMember.roles.remove(process.env.CAPTAIN_ROLE_ID).catch(() => { });
            await targetMember.roles.add(process.env.PLAYER_ROLE_ID).catch(() => { });
            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`${team.abbreviation} ${targetMember.user.username}`).catch(() => { });

            const successMessage = t('playerDemoted', member).replace('{playerName}', targetMember.user.username);
            await interaction.editReply({ content: successMessage, components: [] });

        } else if (customId.startsWith('toggle_mute_player_')) {
            if (isTargetCaptain && !canManage) return interaction.editReply({ content: 'Un capitán no puede mutear a otro capitán.', components: [] });
            const hasMutedRole = targetMember.roles.cache.has(process.env.MUTED_ROLE_ID);
            if (hasMutedRole) {
                await targetMember.roles.remove(process.env.MUTED_ROLE_ID);
                const successMessage = t('playerUnmuted', member).replace('{playerName}', targetMember.user.username);
                await interaction.editReply({ content: successMessage, components: [] });
            } else {
                await targetMember.roles.add(process.env.MUTED_ROLE_ID);
                const successMessage = t('playerMuted', member).replace('{playerName}', targetMember.user.username);
                await interaction.editReply({ content: successMessage, components: [] });
            }
        }
        return;
    }

    if (customId === 'view_teams_button') {
        await interaction.deferReply({ ephemeral: true });
        const teams = await Team.find({ guildId: guild.id }).sort({ name: 1 }).lean();
        if (teams.length === 0) {
            return interaction.editReply({ content: t('errorNoTeamsRegistered', member) });
        }
        await sendPaginatedTeamMenu(interaction, teams, 'view_team_roster_select', 'view', 0, t('viewTeamsPrompt', member));
        return;
    }

    if (customId === 'player_actions_button') {
        await interaction.deferReply({ ephemeral: true });
        const canLeaveTeam = member.roles.cache.has(process.env.PLAYER_ROLE_ID) || member.roles.cache.has(process.env.CAPTAIN_ROLE_ID);

        // Usamos la función 't' para obtener los textos en el idioma del usuario
        const subMenuEmbed = new EmbedBuilder()
            .setTitle(t('playerActionsTitle', member))
            .setDescription(t('playerActionsDescription', member))
            .setColor('Blue');

        const subMenuRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('edit_profile_button').setLabel(t('editProfileButton', member)).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('apply_to_team_button').setLabel(t('applyToTeamButton', member)).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('leave_team_button').setLabel(t('leaveTeamButton', member)).setStyle(ButtonStyle.Danger).setDisabled(!canLeaveTeam)
        );

        return interaction.editReply({ embeds: [subMenuEmbed], components: [subMenuRow] });
    }

    if (customId.startsWith('team_submenu_')) {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        // MÁS ADELANTE TRADUCIREMOS ESTE ERROR
        if (!team) return interaction.editReply({ content: '❌ Debes ser Mánager o Capitán para usar estos menús.' });

        let embed, row1, row2;
        switch (customId) {
            case 'team_submenu_roster':
                embed = new EmbedBuilder().setTitle(t('rosterSubmenuTitle', member)).setColor('Blue').setDescription(t('rosterSubmenuDescription', member));
                if (team.eaClubId) {
                    embed.addFields({ name: '🎮 EA Sports', value: `Vinculado a ID: \`${team.eaClubId}\` (${team.eaPlatform})`, inline: false });
                } else {
                    embed.addFields({ name: '🎮 EA Sports', value: `❌ Sin vincular`, inline: false });
                }
                row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('team_invite_player_button').setLabel(t('invitePlayerButton', member)).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('team_manage_roster_button').setLabel(t('manageMembersButton', member)).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('team_view_roster_button').setLabel(t('viewRosterButton', member)).setStyle(ButtonStyle.Secondary)
                );
                row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('team_toggle_recruitment_button').setLabel(t('toggleRecruitmentButton', member)).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('team_edit_data_button').setLabel(t('editTeamDataButton', member)).setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('team_link_ea_button').setLabel('Vincular EA').setStyle(ButtonStyle.Success).setEmoji('🎮'),
                    new ButtonBuilder().setCustomId('team_unlink_ea_button').setLabel('Desvincular EA').setStyle(ButtonStyle.Danger).setEmoji('❌')
                );
                // Botón de alturas DESACTIVADO temporalmente en panel de managers.
                // La API de EA solo devuelve config actual del Pro, no la del partido jugado.
                // const row3 = new ActionRowBuilder();
                // if (team.eaClubId) {
                //     row3.addComponents(new ButtonBuilder().setCustomId('team_view_ea_heights_button').setLabel('Ver Alturas Plantilla EA').setStyle(ButtonStyle.Primary).setEmoji('📏'));
                // }
                const components = [row1, row2];
                await interaction.editReply({ embeds: [embed], components });
                break;
            case 'team_submenu_friendlies':
                embed = new EmbedBuilder().setTitle(t('friendliesSubmenuTitle', member)).setColor('Green').setDescription(t('friendliesSubmenuDescription', member));
                row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('post_scheduled_panel').setLabel(t('scheduleSearchButton', member)).setStyle(ButtonStyle.Primary).setEmoji('🗓️'),
                    new ButtonBuilder().setCustomId('post_instant_panel').setLabel(t('findRivalNowButton', member)).setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('delete_friendly_panel').setLabel(t('deleteSearchButton', member)).setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
                    new ButtonBuilder().setCustomId('team_view_confirmed_matches').setLabel(t('viewMatchesButton', member)).setStyle(ButtonStyle.Secondary)
                );
                await interaction.editReply({ embeds: [embed], components: [row1] });
                break;
            case 'team_submenu_market':
                embed = new EmbedBuilder().setTitle(t('marketSubmenuTitle', member)).setColor('Purple').setDescription(t('marketSubmenuDescription', member));
                row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('market_post_offer').setLabel(t('createEditOfferButton', member)).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('team_manage_offer_button').setLabel(t('manageOfferButton', member)).setStyle(ButtonStyle.Primary)
                );
                await interaction.editReply({ embeds: [embed], components: [row1] });
                break;
        }
        return;
    }
    if (customId === 'admin_create_league_button') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId('create_league_modal').setTitle('Crear Nueva Liga');
        const leagueNameInput = new TextInputBuilder().setCustomId('leagueNameInput').setLabel("Nombre de la nueva liga").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(leagueNameInput));
        return interaction.showModal(modal);
    }

    if (customId === 'admin_delete_league_button') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const leagues = await League.find({ guildId: guild.id });
        if (leagues.length === 0) {
            return interaction.editReply({ content: t('errorNoLeaguesToDelete', member) });
        }
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('delete_league_select_menu')
            .setPlaceholder('Selecciona las ligas a eliminar')
            .addOptions(leagueOptions)
            .setMinValues(1)
            .setMaxValues(leagues.length);
        return interaction.editReply({ content: t('deleteLeaguesPrompt', member), components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    if (customId === 'admin_manage_team_button') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const teams = await Team.find({ guildId: interaction.guildId }).sort({ name: 1 }).lean();
        if (teams.length === 0) {
            return interaction.editReply({ content: 'No hay equipos registrados en este servidor.' });
        }
        await sendPaginatedTeamMenu(interaction, teams, 'admin_select_team_to_manage', 'manage', 0, 'Selecciona el equipo que deseas gestionar:');
        return;
    }

    if (customId.startsWith('admin_manage_members_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });

        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'Equipo no encontrado.' });

        const addButtonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_add_captains_${teamId}`).setLabel('Añadir Capitán').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId(`admin_add_players_${teamId}`).setLabel('Añadir Jugador').setStyle(ButtonStyle.Success).setEmoji('➕')
        );

        const memberIds = [team.managerId, ...team.captains, ...team.players].filter(Boolean);
        if (memberIds.length === 0) {
            return interaction.editReply({ content: 'Este equipo no tiene miembros actuales. Puedes añadir nuevos utilizando los botones inferiores.', components: [addButtonsRow] });
        }

        const memberObjects = await guild.members.fetch({ user: memberIds }).catch(() => []);
        if (!memberObjects || memberObjects.size === 0) {
            return interaction.editReply({ content: 'No se pudo encontrar a ningún miembro de este equipo en el servidor.', components: [addButtonsRow] });
        }

        const memberOptions = memberObjects.map(m => ({
            label: m.displayName,
            description: `Rol: ${team.managerId === m.id ? 'Mánager' : (team.captains.includes(m.id) ? 'Capitán' : 'Jugador')}`,
            value: m.id
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`roster_management_menu`)
            .setPlaceholder('Selecciona un miembro existente para gestionar')
            .addOptions(memberOptions);

        await interaction.editReply({ 
            content: `Gestionando miembros de **${team.name}**. Selecciona uno de la lista o usa los botones para añadir nuevos miembros:`, 
            components: [new ActionRowBuilder().addComponents(selectMenu), addButtonsRow] 
        });
        return;
    }

    if (customId.startsWith('admin_change_data_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.reply({ content: 'No se encontró el equipo.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`edit_data_modal_${team._id}`).setTitle(`Editar Datos de ${team.name}`);
        const newNameInput = new TextInputBuilder().setCustomId('newName').setLabel("Nuevo Nombre (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.name);
        const newAbbrInput = new TextInputBuilder().setCustomId('newAbbr').setLabel("Nueva Abreviatura (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.abbreviation).setMinLength(3).setMaxLength(3);
        const newLogoInput = new TextInputBuilder().setCustomId('newLogo').setLabel("Nueva URL del Logo (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.logoUrl);
        const newTwitterInput = new TextInputBuilder().setCustomId('newTwitter').setLabel("Twitter del equipo (sin @)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.twitterHandle || '');

        modal.addComponents(
            new ActionRowBuilder().addComponents(newNameInput),
            new ActionRowBuilder().addComponents(newAbbrInput),
            new ActionRowBuilder().addComponents(newLogoInput),
            new ActionRowBuilder().addComponents(newTwitterInput)
        );
        return interaction.showModal(modal);
    }

    if (customId.startsWith('admin_edit_elo_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId).lean();
        if (!team) return interaction.reply({ content: 'No se encontró el equipo.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`admin_edit_elo_modal_${team._id}`).setTitle(`Editar ELO de ${team.name}`);
        const eloInput = new TextInputBuilder()
            .setCustomId('newElo')
            .setLabel("Nuevo ELO (número)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(team.elo || 1000));

        modal.addComponents(new ActionRowBuilder().addComponents(eloInput));
        return interaction.showModal(modal);
    }

    if (customId.startsWith('admin_dissolve_team_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.reply({ content: 'Equipo no encontrado.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`confirm_dissolve_modal_${teamId}`).setTitle(`Disolver Equipo: ${team.name}`);
        const confirmationInput = new TextInputBuilder().setCustomId('confirmation_text').setLabel(`Escribe "${team.name}" para confirmar`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(team.name);
        modal.addComponents(new ActionRowBuilder().addComponents(confirmationInput));
        return interaction.showModal(modal);
    }

    if (customId.startsWith('admin_link_ea_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const teamId = customId.replace('admin_link_ea_', '');
        const team = await Team.findById(teamId);
        if (!team) return interaction.reply({ content: 'Equipo no encontrado.', ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`link_ea_modal_${team._id}`)
            .setTitle(`Vincular EA: ${team.name.substring(0, 20)}`);

        const eaNameInput = new TextInputBuilder()
            .setCustomId('ea_club_name')
            .setLabel("Nombre exacto del club en EA FC")
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

        return interaction.showModal(modal);
    }

    if (customId.startsWith('admin_unlink_ea_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const teamId = customId.replace('admin_unlink_ea_', '');
        const team = await Team.findById(teamId);
        if (!team) return interaction.reply({ content: 'Equipo no encontrado.', ephemeral: true });

        if (!team.eaClubId) return interaction.reply({ content: 'Este equipo no está vinculado a ningún club de EA Sports.', ephemeral: true });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        team.eaClubId = null;
        team.eaPlatform = null;
        await team.save();

        return interaction.editReply({ content: `✅ El equipo **${team.name}** ha sido desvinculado de EA Sports por un administrador.` });
    }

    if (customId.startsWith('admin_ea_heights_')) {
        await interaction.deferReply({ ephemeral: true });
        const teamId = customId.replace('admin_ea_heights_', '');
        const team = await Team.findById(teamId);

        if (!team || !team.eaClubId) return interaction.editReply({ content: 'El equipo no tiene un club de EA vinculado.' });

        try {
            // Import dynamically since eaStatsFetcher is an ES Module
            const eaStatsFetcher = await import('../../utils/eaStatsFetcher.js');
            const playersData = await eaStatsFetcher.fetchClubRosterHeights(team.eaClubId, team.eaPlatform);

            if (!playersData || playersData.length === 0) {
                return interaction.editReply({ content: 'No se encontraron jugadores en la plantilla del club EA.' });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📏 Alturas de Plantilla EA: ${team.eaClubName}`)
                .setColor('Blue')
                .setTimestamp();

            let description = 'Posición | Jugador | Altura\n----------------------------------\n';
            playersData.forEach(p => {
                description += `**${p.posName}** | ${p.name} | \`${p.height}\`\n`;
            });

            embed.setDescription(description);

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('Error fetching ea heights (admin):', err);
            return interaction.editReply({ content: '❌ Error al consultar las alturas con EA Sports.' });
        }
    }

    if (customId.startsWith('admin_scout_player_')) {
        const teamId = customId.replace('admin_scout_player_', '');
        const modal = new ModalBuilder()
            .setCustomId(`scout_player_modal_${teamId}`)
            .setTitle('Scout Jugador EA');

        const playerNameInput = new TextInputBuilder()
            .setCustomId('player_name')
            .setLabel("Nombre del jugador en EA (parcial o exacto)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("Ej: Xavi_Master");

        const platformInput = new TextInputBuilder()
            .setCustomId('platform')
            .setLabel("Consola (Nueva Gen o Antigua Gen)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue("Nueva Gen");

        modal.addComponents(
            new ActionRowBuilder().addComponents(playerNameInput),
            new ActionRowBuilder().addComponents(platformInput)
        );

        return interaction.showModal(modal);
    }

    if (customId.startsWith('admin_ea_matches_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const teamId = customId.replace('admin_ea_matches_', '');
        const team = await Team.findById(teamId);
        
        if (!team || !team.eaClubId) {
            return interaction.reply({ content: '❌ Este equipo no tiene ningún club de EA vinculado.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Origin': 'https://www.ea.com',
                'Referer': 'https://www.ea.com/'
            };

            const urlFriendly = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${team.eaClubId}&platform=${team.eaPlatform}&matchType=friendlyMatch`;

            const [resFriendly] = await Promise.all([
                fetch(urlFriendly, { headers }).catch(() => null)
            ]);

            let dataFriendly = [];
            if (resFriendly && resFriendly.ok) dataFriendly = await resFriendly.json().catch(() => []);
            
            if (!Array.isArray(dataFriendly)) dataFriendly = Object.values(dataFriendly || {});

            let data = [...dataFriendly].sort((a, b) => b.timestamp - a.timestamp);

            if (!Array.isArray(data) || data.length === 0) {
                return interaction.editReply({ content: '❌ No se han encontrado partidos recientes para este club en los servidores de EA.' });
            }

            let finalLogoUrl = team.logoUrl;
            try {
                const infoUrl = `https://proclubs.ea.com/api/fc/clubs/info?clubIds=${team.eaClubId}&platform=${team.eaPlatform}`;
                const infoRes = await fetch(infoUrl, { headers });
                if (infoRes.ok) {
                    const infoData = await infoRes.json();
                    const clubInfo = infoData[team.eaClubId];
                    if (clubInfo && clubInfo.teamId) {
                        finalLogoUrl = `https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l${clubInfo.teamId}.png`;
                    }
                }
            } catch (e) {
                console.error("Error fetching EA club info for logo", e);
            }

            const embed = new EmbedBuilder()
                .setTitle(`Últimos Partidos de EA: ${team.eaClubName || team.name}`)
                .setColor('Blue')
                .setThumbnail(finalLogoUrl)
                .setDescription(`Resultados directamente desde la base de datos de EA Sports para el club ID \`${team.eaClubId}\`:`);

            // --- Helper: extrae goles reales y datos de DNF de un partido ---
            const extractMatchInfo = (match) => {
                const clubIds = Object.keys(match.clubs || {});
                const opponentId = clubIds.find(id => id !== String(team.eaClubId));
                const ourStats = match.clubs[String(team.eaClubId)];
                const oppStats = opponentId ? match.clubs[opponentId] : null;
                let ourGoals = ourStats ? parseInt(ourStats.goals || 0) : 0;
                let oppGoals = oppStats ? parseInt(oppStats.goals || 0) : 0;
                let maxSecs = 0;
                let isDnf = false;

                if ((ourGoals === 3 && oppGoals === 0) || (ourGoals === 0 && oppGoals === 3)) {
                    let realOur = 0, realOpp = 0;
                    if (match.players && match.players[String(team.eaClubId)]) {
                        const ps = Object.values(match.players[String(team.eaClubId)]);
                        realOur = ps.reduce((s, p) => s + parseInt(p.goals || 0), 0);
                        ps.forEach(p => { const sec = parseInt(p.secondsPlayed || 0); if (sec > maxSecs) maxSecs = sec; });
                    }
                    if (match.players && opponentId && match.players[opponentId]) {
                        const ps = Object.values(match.players[opponentId]);
                        realOpp = ps.reduce((s, p) => s + parseInt(p.goals || 0), 0);
                        ps.forEach(p => { const sec = parseInt(p.secondsPlayed || 0); if (sec > maxSecs) maxSecs = sec; });
                    }
                    ourGoals = realOur;
                    oppGoals = realOpp;
                    if (maxSecs > 0 && maxSecs < 5200) isDnf = true;
                }

                const oppName = oppStats?.details?.name || (opponentId ? `Club ID ${opponentId}` : 'Desconocido');
                return { ourGoals, oppGoals, maxSecs, isDnf, opponentId, oppName, timestamp: match.timestamp };
            };

            // --- Agrupar partidos consecutivos contra el mismo rival y fusionar si hubo DNF ---
            const entries = [];
            let mi = 0;
            while (mi < data.length) {
                const info = extractMatchInfo(data[mi]);
                const group = [info];
                let ni = mi + 1;

                // Buscar partidos consecutivos contra el mismo rival dentro de 3 horas
                while (ni < data.length) {
                    const nextInfo = extractMatchInfo(data[ni]);
                    const timeDiff = Math.abs(info.timestamp - nextInfo.timestamp);
                    if (nextInfo.opponentId === info.opponentId && timeDiff < 3 * 3600) {
                        group.push(nextInfo);
                        ni++;
                    } else {
                        break;
                    }
                }

                const hasDnf = group.some(g => g.isDnf);

                if (hasDnf && group.length > 1) {
                    // Fusionar: sumar goles reales de todas las sesiones
                    let totalOur = 0, totalOpp = 0, totalSecs = 0;
                    for (const g of group) { totalOur += g.ourGoals; totalOpp += g.oppGoals; totalSecs += g.maxSecs; }
                    const earliest = Math.min(...group.map(g => g.timestamp));
                    let emoji = '⚪';
                    if (totalOur > totalOpp) emoji = '🟢';
                    if (totalOur < totalOpp) emoji = '🔴';
                    const dateStr = new Date(earliest * 1000).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' });

                    // Desglose de sesiones (orden cronológico: la más antigua primero)
                    const sortedGroup = [...group].sort((a, b) => a.timestamp - b.timestamp);
                    let sessionLines = '';
                    for (let si = 0; si < sortedGroup.length; si++) {
                        const s = sortedGroup[si];
                        const prefix = si < sortedGroup.length - 1 ? '├' : '└';
                        let dnfTag = '';
                        if (s.isDnf) {
                            const dnfMin = Math.floor(s.maxSecs / 60);
                            dnfTag = ` 🔌 Min ${dnfMin}`;
                        }
                        sessionLines += `\n${prefix} Sesión ${si + 1}: ${s.ourGoals} - ${s.oppGoals}${dnfTag}`;
                    }

                    entries.push({
                        name: `${emoji} vs ${info.oppName}`,
                        value: `**Resultado:** ${totalOur} - ${totalOpp} *(🔗 ${group.length} sesiones)*${sessionLines}\n🕛 *${dateStr}*`
                    });
                } else {
                    // Sin merge: mostrar cada partido individualmente
                    for (const g of group) {
                        let dnfText = '';
                        if (g.isDnf) {
                            const dnfMin = Math.floor(g.maxSecs / 60);
                            dnfText = ` *(🔌 Desconexión Min ${dnfMin})*`;
                        }
                        let emoji = '⚪';
                        if (g.ourGoals > g.oppGoals) emoji = '🟢';
                        if (g.ourGoals < g.oppGoals) emoji = '🔴';
                        const dateStr = new Date(g.timestamp * 1000).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' });
                        entries.push({
                            name: `${emoji} vs ${g.oppName}`,
                            value: `**Resultado:** ${g.ourGoals} - ${g.oppGoals}${dnfText}\n🕛 *${dateStr}*`
                        });
                    }
                }
                mi = ni;
            }

            // Mostrar los últimos 5 resultados (ya procesados/fusionados)
            for (const entry of entries.slice(0, 5)) {
                embed.addFields({ name: entry.name, value: entry.value, inline: false });
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching EA matches for admin panel:', error);
            return interaction.editReply({ content: '❌ Hubo un error de conexión con la API de EA.' });
        }
    }

    if (customId === 'admin_view_pending_requests') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        if (!approvalChannelId) {
            return interaction.reply({ content: 'La variable de entorno `APPROVAL_CHANNEL_ID` no está configurada.', ephemeral: true });
        }
        return interaction.reply({ content: `Todas las solicitudes de registro de equipo pendientes se encuentran en el canal <#${approvalChannelId}>.`, ephemeral: true });
    }

    if (customId === 'admin_toggle_crawler') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const settingsColl = mongoose.connection.client.db('test').collection('bot_settings');
        const settings = await settingsColl.findOne({ _id: 'global_config' });
        
        if (!settings) return interaction.editReply({ content: 'Configuración global no encontrada.' });
        
        const newState = !settings.crawlerEnabled;
        await settingsColl.updateOne({ _id: 'global_config' }, { $set: { crawlerEnabled: newState } });
        
        return interaction.editReply({ content: `✅ Crawler de Estadísticas VPG actualizado: **${newState ? 'ON 🟢' : 'OFF 🔴'}**` });
    }

    if (customId === 'admin_config_crawler_days') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        
        const settingsColl = mongoose.connection.client.db('test').collection('bot_settings');
        const settings = await settingsColl.findOne({ _id: 'global_config' });
        const currentDays = settings ? (settings.crawlerDays || []) : [];

        const dayOptions = [
            { label: 'Lunes', value: '1', default: currentDays.includes(1) },
            { label: 'Martes', value: '2', default: currentDays.includes(2) },
            { label: 'Miércoles', value: '3', default: currentDays.includes(3) },
            { label: 'Jueves', value: '4', default: currentDays.includes(4) },
            { label: 'Viernes', value: '5', default: currentDays.includes(5) },
            { label: 'Sábado', value: '6', default: currentDays.includes(6) },
            { label: 'Domingo', value: '0', default: currentDays.includes(0) }
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_crawler_days_select')
            .setPlaceholder('Selecciona los días a escanear')
            .addOptions(dayOptions)
            .setMinValues(1)
            .setMaxValues(7);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.editReply({ content: 'Selecciona qué días de la semana quieres que el Crawler de EA actúe buscando estadísticas automáticamente.', components: [row] });
    }

    if (customId === 'admin_force_crawler') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        
        interaction.editReply({ content: '🚀 Iniciando escaneo manual del Crawler en segundo plano... (Esto no bloqueará el bot, te avisaré aquí si puedo o simplemente revisa los resultados con el comando Scout en unos minutos).' });
        
        try {
            const { runVpgCrawler } = await import('../utils/eaStatsCrawler.js');
            await runVpgCrawler(true); // force manual = true
            return interaction.editReply({ content: '✅ ¡Escaneo manual de EA Sports completado con éxito! Todas las estadísticas locales han sido actualizadas.' });
        } catch (error) {
            console.error('[CRAWLER] Error manual:', error);
            return interaction.editReply({ content: '❌ Hubo un error al forzar el escaneo del Crawler. Revisa la consola.' });
        }
    }

    // --- Lógica para los botones de GESTIÓN DE PLANTILLA ---
    if (customId === 'team_invite_player_button') {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findOne({ guildId: guild.id, managerId: user.id });
        if (!team) {
            return interaction.editReply({ content: t('errorOnlyManagersCanInvite', member) });
        }

        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId('invite_player_select')
            .setPlaceholder('Busca y selecciona un jugador')
            .setMinValues(1)
            .setMaxValues(1);

        await interaction.editReply({
            content: t('invitePlayerMenuHeader', member),
            components: [new ActionRowBuilder().addComponents(userSelectMenu)]
        });
        return;
    }

    if (customId === 'team_manage_roster_button') {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) {
            return interaction.editReply({ content: t('errorTeamNotFound', member) });
        }

        const isManager = team.managerId === user.id;
        let memberIds = isManager ? [...team.captains, ...team.players] : team.players;

        if (memberIds.length === 0) {
            return interaction.editReply({ content: t('errorNoMembersToManage', member) });
        }

        const memberObjects = await guild.members.fetch({ user: memberIds });
        const memberOptions = memberObjects.map(m => ({ label: m.displayName, description: `ID: ${m.id}`, value: m.id }));

        if (memberOptions.length === 0) {
            // Este es un error técnico, lo dejamos sin traducir por ahora
            return interaction.editReply({ content: t('errorNoValidMembers', member) });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('roster_management_menu')
            .setPlaceholder(t('manageRosterMenuPlaceholder', member))
            .addOptions(memberOptions);

        await interaction.editReply({ content: t('manageRosterHeader', member), components: [new ActionRowBuilder().addComponents(selectMenu)] });
        return;
    }

    if (customId === 'team_view_roster_button') {
        await interaction.deferReply({ ephemeral: true });
        const teamToView = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }] });
        if (!teamToView) return interaction.editReply({ content: t('errorNotInAnyTeam', member) });

        const allMemberIds = [teamToView.managerId, ...teamToView.captains, ...teamToView.players].filter(id => id);
        if (allMemberIds.length === 0) return interaction.editReply({ content: t('errorTeamHasNoMembers', member) });

        const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } }).lean();
        const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));

        let rosterString = '';
        const fetchMemberInfo = async (ids, roleNameKey) => {
            if (!ids || ids.length === 0) return;
            rosterString += `\n**${t(roleNameKey, member)}**\n`; // Usamos la clave de traducción
            for (const memberId of ids) {
                try {
                    const memberData = await guild.members.fetch(memberId);
                    const vpgUser = memberMap.get(memberId)?.vpgUsername || 'N/A';
                    rosterString += `> ${memberData.user.username} (${vpgUser})\n`;
                } catch (error) { rosterString += `> *Usuario no encontrado (ID: ${memberId})*\n`; }
            }
        };

        await fetchMemberInfo([teamToView.managerId].filter(Boolean), 'rosterManager');
        await fetchMemberInfo(teamToView.captains, 'rosterCaptains');
        await fetchMemberInfo(teamToView.players, 'rosterPlayers');

        const embedTitle = t('rosterEmbedTitle', member).replace('{teamName}', teamToView.name);
        const embedFooter = t('rosterLeague', member).replace('{leagueName}', teamToView.league);

        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(rosterString.trim() || t('rosterNoMembers', member))
            .setColor('#3498db')
            .setThumbnail(teamToView.logoUrl)
            .setFooter({ text: embedFooter });

        return interaction.editReply({ embeds: [embed] });
    }

    if (customId === 'team_toggle_recruitment_button') {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findOne({ guildId: guild.id, managerId: user.id }); // Solo el mánager puede
        if (!team) return interaction.editReply({ content: t('errorOnlyManagersToggleRecruitment', member) });

        team.recruitmentOpen = !team.recruitmentOpen;
        await team.save();

        const description = (team.recruitmentOpen ? t('recruitmentStatusOpen', member) : t('recruitmentStatusClosed', member))
            .replace('{teamName}', team.name);
        const color = team.recruitmentOpen ? 'Green' : 'Red';

        const embed = new EmbedBuilder()
            .setTitle(t('recruitmentStatusTitle', member))
            .setDescription(description)
            .setColor(color);

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    if (customId === 'team_edit_data_button') {
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.reply({ content: 'No se encontró tu equipo o no tienes permisos.', ephemeral: true });

        const isManager = team.managerId === user.id;
        if (!isManager) return interaction.reply({ content: 'Solo el mánager del equipo puede editar sus datos.', ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`edit_data_modal_${team._id}`)
            .setTitle(`Editar Datos de ${team.name}`);

        const newNameInput = new TextInputBuilder().setCustomId('newName').setLabel("Nuevo Nombre (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.name);
        const newAbbrInput = new TextInputBuilder().setCustomId('newAbbr').setLabel("Nueva Abreviatura (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.abbreviation).setMinLength(3).setMaxLength(3);
        const newLogoInput = new TextInputBuilder().setCustomId('newLogo').setLabel("Nueva URL del Logo (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.logoUrl);
        const newTwitterInput = new TextInputBuilder().setCustomId('newTwitter').setLabel("Twitter del equipo (sin @)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.twitterHandle || '');

        modal.addComponents(
            new ActionRowBuilder().addComponents(newNameInput),
            new ActionRowBuilder().addComponents(newAbbrInput),
            new ActionRowBuilder().addComponents(newLogoInput),
            new ActionRowBuilder().addComponents(newTwitterInput)
        );

        return interaction.showModal(modal);
    }

    if (customId === 'team_unlink_ea_button') {
        const team = await Team.findOne({ guildId: guild.id, managerId: user.id });
        if (!team) return interaction.reply({ content: 'No se encontró tu equipo o no eres el mánager del mismo.', flags: MessageFlags.Ephemeral });

        if (!team.eaClubId) return interaction.reply({ content: 'Tu equipo no está vinculado a ningún club de EA Sports actualmente.', flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        team.eaClubId = null;
        team.eaPlatform = null;
        await team.save();

        return interaction.editReply({ content: '✅ El equipo ha sido **desvinculado** de EA Sports exitosamente.' });
    }

    if (customId === 'team_link_ea_button') {
        const botSettings = await mongoose.connection.client.db('test').collection('bot_settings').findOne({ _id: 'global_config' });
        if (botSettings && !botSettings.eaScannerEnabled) {
            return interaction.reply({ content: '❌ El escáner de EA Sports no está activo actualmente. No es necesario vincular tu equipo en este momento.', ephemeral: true });
        }

        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.reply({ content: 'No se encontró tu equipo o no tienes permisos.', ephemeral: true });

        const isManager = team.managerId === user.id;
        const isCaptain = team.captains && team.captains.includes(user.id);
        if (!isManager && !isCaptain) return interaction.reply({ content: 'Solo el mánager o capitanes del equipo pueden vincularlo con EA Sports.', ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`link_ea_modal_${team._id}`)
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

        return interaction.showModal(modal);
    }

    if (customId === 'team_view_ea_heights_button') {
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team || !team.eaClubId) return interaction.reply({ content: 'No tienes un club de EA vinculado.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Import fetchClubRosterHeights dynamically because it's an ES Module
            const eaStatsFetcher = await import('../../utils/eaStatsFetcher.js');
            const playersData = await eaStatsFetcher.fetchClubRosterHeights(team.eaClubId, team.eaPlatform);

            if (!playersData || playersData.length === 0) {
                return interaction.editReply({ content: 'No se encontraron jugadores en la plantilla del club EA.' });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📏 Alturas de Plantilla EA: ${team.eaClubName}`)
                .setColor('Blue')
                .setTimestamp();

            let description = 'Posición | Jugador | Altura\n----------------------------------\n';
            playersData.forEach(p => {
                description += `**${p.posName}** | ${p.name} | \`${p.height}\`\n`;
            });

            embed.setDescription(description);

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('Error fetching ea heights:', err);
            return interaction.editReply({ content: '❌ Error al consultar las alturas con EA Sports.' });
        }
    }

    // --- Lógica para el Panel de Amistosos ---

    if (customId === 'post_scheduled_panel') {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: t('errorTeamNotFound', member) });

        const existingPanel = await AvailabilityPanel.findOne({ teamId: team._id, panelType: 'SCHEDULED' });
        if (existingPanel) {
            const channel = guild.channels.cache.get(existingPanel.channelId);
            const errorMessage = t('errorExistingScheduledPanel', member).replace('{channel}', channel || 'un canal');
            return interaction.editReply({ content: errorMessage });
        }

        const leagues = await League.find({ guildId: guild.id }).lean();
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));

        const leaguesMenu = new StringSelectMenuBuilder()
            .setCustomId('select_league_filter_SCHEDULED')
            .setPlaceholder(t('leagueFilterPlaceholder', member))
            .addOptions(leagueOptions)
            .setMinValues(0)
            .setMaxValues(leagueOptions.length > 0 ? leagueOptions.length : 1);

        const continueButton = new ButtonBuilder()
            .setCustomId('continue_panel_creation_SCHEDULED_all')
            .setLabel(t('continueButtonLabel', member))
            .setStyle(ButtonStyle.Primary);

        const components = [new ActionRowBuilder().addComponents(continueButton)];
        if (leagueOptions.length > 0) {
            components.unshift(new ActionRowBuilder().addComponents(leaguesMenu));
        }

        await interaction.editReply({ content: t('friendlyStep1Header', member), components });
        return;
    }
    if (customId.startsWith('continue_panel_creation_')) {
        const panelType = customId.split('_')[3];
        const leaguesString = customId.split('_').slice(4).join('_');

        if (panelType === 'SCHEDULED') {
            const timeSlots = ['22:00', '22:20', '22:40', '23:00', '23:20', '23:40'];
            const timeOptions = timeSlots.map(t => ({ label: t, value: t }));

            const timeMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_available_times_${leaguesString}`)
                .setPlaceholder(t('timeSlotsPlaceholder', member))
                .addOptions(timeOptions)
                .setMinValues(1)
                .setMaxValues(timeSlots.length);

            await interaction.update({
                content: t('friendlyStep2Header', member),
                components: [new ActionRowBuilder().addComponents(timeMenu)]
            });
        }
        return;
    }

    if (customId === 'post_instant_panel') {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: t('errorTeamNotFound', member) });

        const existingPanel = await AvailabilityPanel.findOne({ teamId: team._id, panelType: 'INSTANT' });
        if (existingPanel) {
            const channel = guild.channels.cache.get(existingPanel.channelId);
            const errorMessage = t('errorExistingInstantPanel', member).replace('{channel}', channel || 'un canal');
            return interaction.editReply({ content: errorMessage });
        }

        const channelId = process.env.INSTANT_FRIENDLY_CHANNEL_ID;
        if (!channelId) return interaction.editReply({ content: t('errorInstantChannelNotSet', member) });
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: t('errorInstantChannelNotFound', member) });

        const webhook = await getOrCreateWebhook(channel, client);
        const message = await webhook.send({ content: 'Creando panel...', username: team.name, avatarURL: team.logoUrl });

        const panel = new AvailabilityPanel({
            guildId: guild.id,
            channelId,
            messageId: message.id,
            teamId: team._id,
            postedById: user.id,
            panelType: 'INSTANT',
            timeSlots: [{ time: 'INSTANT', status: 'AVAILABLE' }]
        });

        await panel.save();
        await updatePanelMessage(client, panel._id);

        const successMessage = t('instantPanelCreatedSuccess', member).replace('{channel}', channel.toString());
        return interaction.editReply({ content: successMessage });
    }

    if (customId === 'delete_friendly_panel') {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: t('errorTeamNotFound', member) });

        const panels = await AvailabilityPanel.find({ teamId: team._id });
        if (panels.length === 0) return interaction.editReply({ content: t('errorNoPanelsToDelete', member) });

        let deletedCount = 0;
        for (const panel of panels) {
            try {
                const channel = await client.channels.fetch(panel.channelId);
                const webhook = await getOrCreateWebhook(channel, client);
                await webhook.deleteMessage(panel.messageId);
            } catch (error) {
                console.log(`No se pudo borrar el mensaje del panel ${panel.messageId}. Puede que ya no existiera.`);
            }
            await AvailabilityPanel.findByIdAndDelete(panel._id);
            deletedCount++;
        }

        const successMessage = t('panelsDeletedSuccess', member).replace('{count}', deletedCount);
        return interaction.editReply({ content: successMessage });
    }

    if (customId.startsWith('challenge_slot_')) {
        await interaction.deferReply({ ephemeral: true });

        const challengerTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!challengerTeam) return interaction.editReply({ content: t('errorMustBeManagerOrCaptain', member) });

        const [, , panelId, time] = customId.split('_');

        const existingMatch = await AvailabilityPanel.findOne({
            guildId: guild.id,
            "timeSlots.time": time,
            "timeSlots.status": "CONFIRMED",
            $or: [{ teamId: challengerTeam._id }, { "timeSlots.challengerTeamId": challengerTeam._id }]
        }).populate('teamId timeSlots.challengerTeamId');

        if (existingMatch) {
            const opponentTeam = existingMatch.teamId._id.equals(challengerTeam._id) ? existingMatch.timeSlots.find(s => s.time === time).challengerTeamId : existingMatch.teamId;
            const opponentName = opponentTeam ? opponentTeam.name : '...';
            return interaction.editReply({ content: t('errorChallengeMatchConfirmed', member).replace('{time}', time).replace('{opponentName}', opponentName) });
        }

        const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
        if (!panel) return interaction.editReply({ content: t('errorPanelNoLongerExists', member) });
        if (panel.teamId._id.equals(challengerTeam._id)) return interaction.editReply({ content: t('errorChallengeOwnTeam', member) });
        if (panel.leagues && panel.leagues.length > 0 && !panel.leagues.includes(challengerTeam.league)) {
            return interaction.editReply({ content: t('errorChallengeLeagueFilter', member).replace('{leagues}', panel.leagues.join(', ')) });
        }
        const slot = panel.timeSlots.find(s => s.time === time);
        if (!slot || slot.status === 'CONFIRMED') return interaction.editReply({ content: t('errorChallengeUnavailable', member) });
        if (slot.pendingChallenges.some(c => c.teamId.equals(challengerTeam._id))) {
            return interaction.editReply({ content: t('errorChallengeAlreadyPending', member) });
        }

        const newChallenge = { teamId: challengerTeam._id, userId: user.id };
        slot.pendingChallenges.push(newChallenge);

        await panel.save();

        const updatedPanel = await AvailabilityPanel.findById(panelId);
        const updatedSlot = updatedPanel.timeSlots.find(s => s.time === time);
        const savedChallenge = updatedSlot.pendingChallenges.find(c => c.userId === user.id && c.teamId.equals(challengerTeam._id));

        if (!savedChallenge) {
            // Este es un mensaje de error interno, no necesita traducción.
            return interaction.editReply({ content: 'Hubo un error al procesar tu desafío. Inténtalo de nuevo.' });
        }

        const hostManagerId = panel.teamId.managerId;
        const hostCaptains = await Team.findById(panel.teamId).select('captains').lean();

        const recipients = [hostManagerId, ...hostCaptains.captains];
        const uniqueRecipients = [...new Set(recipients)];

        // Botones bilingües para el MD, ya que no sabemos el idioma del receptor con certeza.
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_challenge_${panel._id}_${time}_${savedChallenge._id}`).setLabel('Accept / Aceptar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_challenge_${panel._id}_${time}_${savedChallenge._id}`).setLabel('Decline / Rechazar').setStyle(ButtonStyle.Danger)
        );

        let notified = false;
        for (const recipientId of uniqueRecipients) {
            try {
                const recipientUser = await client.users.fetch(recipientId);
                // Obtenemos el 'member' para traducir el MD a su idioma.
                const recipientMember = await guild.members.fetch(recipientId);

                const embed = new EmbedBuilder()
                    .setTitle(t('challengeReceivedTitle', recipientMember))
                    .setDescription(t('challengeReceivedDescription', recipientMember)
                        .replace('{challengerTeamName}', challengerTeam.name)
                        .replace('{time}', time))
                    .setColor('Gold')
                    .setThumbnail(challengerTeam.logoUrl);

                await recipientUser.send({ embeds: [embed], components: [row] });
                notified = true;
            } catch (error) {
                console.log(`No se pudo notificar a ${recipientId}`);
            }
        }

        if (!notified) {
            panel.timeSlots.find(s => s.time === time).pendingChallenges = panel.timeSlots.find(s => s.time === time).pendingChallenges.filter(c => !c._id.equals(savedChallenge._id));
            await panel.save();
            await interaction.editReply({ content: t('errorDMChallengeFailed', member) });
            await updatePanelMessage(client, panel._id);
            return;
        }

        await updatePanelMessage(client, panel._id);
        return interaction.editReply({ content: t('challengeSent', member) });
    }

    if (customId.startsWith('cancel_all_challenges_')) {
        await interaction.deferReply({ ephemeral: true });
        const panelId = customId.split('_')[3];
        const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
        if (!panel) return interaction.editReply({ content: t('errorPanelNoLongerExists', member) });

        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!userTeam || !userTeam._id.equals(panel.teamId._id)) {
            return interaction.editReply({ content: t('errorNoPermissionCancel', member) });
        }

        const challengesToNotify = [];
        panel.timeSlots.forEach(slot => {
            if (slot.pendingChallenges && slot.pendingChallenges.length > 0) {
                challengesToNotify.push(...slot.pendingChallenges);
                slot.pendingChallenges = [];
            }
        });

        if (challengesToNotify.length === 0) {
            return interaction.editReply({ content: t('errorNoPendingToCancel', member) });
        }

        await panel.save();

        for (const challenge of challengesToNotify) {
            const userToNotify = await client.users.fetch(challenge.userId).catch(() => null);
            if (userToNotify) {
                // Mensaje bilingüe fijo para el MD, es la solución más robusta.
                await userToNotify.send(`The team **${panel.teamId.name}** has cancelled all their pending challenges, including yours.\nEl equipo **${panel.teamId.name}** ha cancelado todas sus peticiones de desafío pendientes, incluyendo la tuya.`).catch(() => { });
            }
        }

        await updatePanelMessage(client, panel._id);
        return interaction.editReply({ content: t('successCancelledAll', member) });
    }

    if (customId.startsWith('abandon_challenge_')) {
        await interaction.deferReply({ ephemeral: true });
        const [, , panelId, time] = customId.split('_');
        const panel = await AvailabilityPanel.findById(panelId);
        if (!panel) return interaction.editReply({ content: t('errorPanelNoLongerExists', member) });

        const slot = panel.timeSlots.find(s => s.time === time);
        if (!slot || slot.status !== 'CONFIRMED') return interaction.editReply({ content: t('errorNoMatchToAbandon', member) });

        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        const isHost = userTeam?._id.equals(panel.teamId);
        const isChallenger = userTeam?._id.equals(slot.challengerTeamId);
        if (!isHost && !isChallenger) return interaction.editReply({ content: t('errorNotInMatch', member) });

        const otherTeamId = isHost ? slot.challengerTeamId : panel.teamId;
        const otherTeam = await Team.findById(otherTeamId);
        if (!otherTeam) {
            // Si el otro equipo no existe, simplemente limpiamos nuestro panel.
            slot.status = 'AVAILABLE';
            slot.challengerTeamId = null;
            await panel.save();
            await updatePanelMessage(client, panel._id);
            return interaction.editReply({ content: t('successMatchAbandoned', member) });
        }

        slot.status = 'AVAILABLE';
        slot.challengerTeamId = null;
        await panel.save();

        const otherTeamPanel = await AvailabilityPanel.findOne({ teamId: otherTeamId, panelType: panel.panelType });
        if (otherTeamPanel) {
            const otherTeamSlot = otherTeamPanel.timeSlots.find(s => s.time === time);
            if (otherTeamSlot && otherTeamSlot.status === 'CONFIRMED') {
                otherTeamSlot.status = 'AVAILABLE';
                otherTeamSlot.challengerTeamId = null;
                await otherTeamPanel.save();
                await updatePanelMessage(client, otherTeamPanel._id);
            }
        }

        await updatePanelMessage(client, panel._id);
        await interaction.editReply({ content: t('successMatchAbandoned', member) });

        const otherTeamLeaders = [otherTeam.managerId, ...otherTeam.captains];
        for (const leaderId of otherTeamLeaders) {
            const otherLeader = await client.users.fetch(leaderId).catch(() => null);
            if (otherLeader) {
                try {
                    const otherLeaderMember = await guild.members.fetch(leaderId);
                    const notification = t('dmMatchAbandonedNotification', otherLeaderMember).replace('{teamName}', userTeam.name).replace('{time}', time);
                    await otherLeader.send(notification).catch(() => { });
                } catch (e) { /* El miembro ya no está en el servidor, ignorar */ }
            }
        }
        return;
    }
    if (customId.startsWith('contact_opponent_')) {
        await interaction.deferReply({ ephemeral: true });
        const [, , teamId1, teamId2] = customId.split('_');

        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!userTeam) return interaction.editReply({ content: t('errorMustBeManagerOrCaptain', member) });

        let opponentTeamId = null;
        if (userTeam._id.equals(teamId1)) {
            opponentTeamId = teamId2;
        } else if (userTeam._id.equals(teamId2)) {
            opponentTeamId = teamId1;
        } else {
            return interaction.editReply({ content: t('errorNotInMatch', member) });
        }

        const opponentTeam = await Team.findById(opponentTeamId).lean();
        if (!opponentTeam) return interaction.editReply({ content: t('errorOpponentNotFound', member) });

        return interaction.editReply({ content: t('contactOpponentMessage', member).replace('{managerId}', opponentTeam.managerId) });
    }

    if (customId === 'team_view_confirmed_matches') {
        await interaction.deferReply({ ephemeral: true });
        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }] });
        if (!userTeam) return interaction.editReply({ content: t('errorNotInAnyTeam', member) });

        const confirmedPanels = await AvailabilityPanel.find({
            guildId: guild.id,
            "timeSlots.status": "CONFIRMED",
            $or: [{ teamId: userTeam._id }, { "timeSlots.challengerTeamId": userTeam._id }]
        }).populate('teamId timeSlots.challengerTeamId').lean();

        let description = '';
        const allConfirmedSlots = [];
        for (const panel of confirmedPanels) {
            for (const slot of panel.timeSlots) {
                if (slot.status === 'CONFIRMED') {
                    const isHost = panel.teamId._id.equals(userTeam._id);
                    if (isHost || (slot.challengerTeamId && userTeam._id.equals(slot.challengerTeamId._id))) {
                        const opponent = isHost ? slot.challengerTeamId : panel.teamId;
                        if (opponent) { allConfirmedSlots.push({ time: slot.time, opponent }); }
                    }
                }
            }
        }

        const uniqueMatches = [...new Map(allConfirmedSlots.map(item => [item.time, item])).values()];
        uniqueMatches.sort((a, b) => a.time.localeCompare(b.time));

        for (const match of uniqueMatches) {
            description += t('matchInfoLine', member)
                .replace('{time}', match.time)
                .replace('{opponentName}', match.opponent.name)
                .replace('{managerId}', match.opponent.managerId);
        }

        if (description === '') {
            description = t('noConfirmedMatches', member);
        }

        const embedTitle = t('confirmedMatchesTitle', member).replace('{teamName}', userTeam.name);
        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(description)
            .setColor('Green')
            .setThumbnail(userTeam.logoUrl)
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
    // --- Lógica de Mercado de Fichajes y Perfil de Jugador ---

    if (customId === 'edit_profile_button') {
        const positionOptions = POSITION_KEYS.map(p => ({
            label: t(`pos_${p}`, member),
            value: p
        }));

        const primaryMenu = new StringSelectMenuBuilder()
            .setCustomId('update_select_primary_position')
            .setPlaceholder(t('primaryPositionPlaceholder', member))
            .addOptions(positionOptions);

        await interaction.reply({
            content: t('updateProfilePrompt', member),
            components: [new ActionRowBuilder().addComponents(primaryMenu)],
            ephemeral: true
        });
        return;
    }

    if (customId === 'apply_to_team_button') {
        await interaction.deferReply({ ephemeral: true });
        const isManager = await Team.findOne({ guildId: guild.id, managerId: user.id });
        if (isManager) {
            return interaction.editReply({ content: t('errorManagerCannotApply', member) });
        }
        const existingApplication = await PlayerApplication.findOne({ userId: user.id, status: 'pending' });
        if (existingApplication) {
            return interaction.editReply({ content: t('errorApplicationPending', member) });
        }

        const openTeams = await Team.find({ guildId: guild.id, recruitmentOpen: true }).sort({ name: 1 }).lean();
        if (openTeams.length === 0) {
            return interaction.editReply({ content: t('errorNoRecruitingTeams', member) });
        }
        await sendPaginatedTeamMenu(interaction, openTeams, 'apply_to_team_select', 'apply', 0, t('applyToTeamMenuHeader', member));
        return;
    }

    if (customId === 'leave_team_button') {
        await interaction.deferReply({ ephemeral: true });
        const teamToLeave = await Team.findOne({ guildId: guild.id, $or: [{ captains: user.id }, { players: user.id }] });
        if (!teamToLeave) {
            return interaction.editReply({ content: t('errorNotInTeamToLeave', member) });
        }

        teamToLeave.players = teamToLeave.players.filter(p => p !== user.id);
        teamToLeave.captains = teamToLeave.captains.filter(c => c !== user.id);
        await teamToLeave.save();

        await member.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => { });
        if (member.id !== guild.ownerId) await member.setNickname(member.user.username).catch(() => { });

        const successMessage = t('leaveTeamSuccess', member).replace('{teamName}', teamToLeave.name);
        await interaction.editReply({ content: successMessage });

        // El MD al mánager se envía bilingüe, ya que no sabemos su idioma.
        const manager = await client.users.fetch(teamToLeave.managerId).catch(() => null);
        if (manager) {
            await manager.send(`The player **${user.tag}** has left your team.\nEl jugador **${user.tag}** ha abandonado tu equipo.`);
        }
        return;
    }

    if (customId.startsWith('market_')) {
        if (customId === 'market_post_agent') {
            const hasRequiredRole = member.roles.cache.has(process.env.PLAYER_ROLE_ID) || member.roles.cache.has(process.env.CAPTAIN_ROLE_ID);
            if (!hasRequiredRole) {
                return interaction.reply({ content: t('errorPlayerRoleNeeded', member), ephemeral: true });
            }
            const modal = new ModalBuilder().setCustomId('market_agent_modal').setTitle(t('agentModalTitle', member));
            const experienceInput = new TextInputBuilder().setCustomId('experienceInput').setLabel(t('agentModalExperienceLabel', member)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
            const seekingInput = new TextInputBuilder().setCustomId('seekingInput').setLabel(t('agentModalSeekingLabel', member)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
            const availabilityInput = new TextInputBuilder().setCustomId('availabilityInput').setLabel(t('agentModalAvailabilityLabel', member)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200);
            modal.addComponents(new ActionRowBuilder().addComponents(experienceInput), new ActionRowBuilder().addComponents(seekingInput), new ActionRowBuilder().addComponents(availabilityInput));
            await interaction.showModal(modal);

        } else if (customId === 'market_post_offer') {
            await interaction.deferReply({ ephemeral: true });
            const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
            if (!team) return interaction.editReply({ content: t('errorMustBeManagerOrCaptain', member) });

            const positionOptions = POSITION_KEYS.map(p => ({ label: t(`pos_${p}`, member), value: p }));
            const positionMenu = new StringSelectMenuBuilder()
                .setCustomId(`offer_select_positions_${team._id}`)
                .setPlaceholder(t('offerPositionsPlaceholder', member))
                .addOptions(positionOptions)
                .setMinValues(1)
                .setMaxValues(positionOptions.length);

            await interaction.editReply({
                content: t('offerStep1Header', member),
                components: [new ActionRowBuilder().addComponents(positionMenu)],
            });

        } else if (customId === 'market_search_teams') {
            await interaction.deferReply({ ephemeral: true });
            const leagues = await League.find({ guildId: guild.id }).lean();
            const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
            const positionOptions = POSITION_KEYS.map(p => ({ label: t(`pos_${p}`, member), value: p }));

            const positionMenu = new StringSelectMenuBuilder()
                .setCustomId('search_team_pos_filter')
                .setPlaceholder(t('filterTeamPosPlaceholder', member))
                .addOptions({ label: t('filterAnyPosition', member), value: 'ANY' }, ...positionOptions);

            const leagueMenu = new StringSelectMenuBuilder()
                .setCustomId('search_team_league_filter')
                .setPlaceholder(t('filterTeamLeaguePlaceholder', member))
                .addOptions({ label: t('filterAnyLeague', member), value: 'ANY' }, ...leagueOptions);

            await interaction.editReply({ content: t('filterMenuPrompt', member), components: [new ActionRowBuilder().addComponents(positionMenu), new ActionRowBuilder().addComponents(leagueMenu)] });

        } else if (customId === 'market_manage_ad') {
            await interaction.deferReply({ ephemeral: true });
            const existingAd = await FreeAgent.findOne({ userId: user.id });

            if (!existingAd) {
                return interaction.editReply({ content: t('errorNoActiveAd', member) });
            }

            const notSpecified = t('valueNotSpecified', member);
            const embed = new EmbedBuilder()
                .setTitle(t('manageAdEmbedTitle', member))
                .setDescription(t('manageAdEmbedDescription', member))
                .addFields(
                    { name: t('manageAdFieldExperience', member), value: existingAd.experience || notSpecified },
                    { name: t('manageAdFieldSeeking', member), value: existingAd.seeking || notSpecified },
                    { name: t('manageAdFieldAvailability', member), value: existingAd.availability || notSpecified }
                )
                .setColor('Orange');

            const managementRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('market_edit_ad_button').setLabel(t('editAdButton', member)).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('market_delete_ad_button').setLabel(t('deleteAdButton', member)).setStyle(ButtonStyle.Danger)
            );

            await interaction.editReply({ embeds: [embed], components: [managementRow] });

        } else if (customId === 'market_delete_ad_button') {
            await interaction.deferUpdate();
            const adToDelete = await FreeAgent.findOne({ userId: user.id });

            if (adToDelete && adToDelete.messageId) {
                try {
                    const channel = await client.channels.fetch(process.env.PLAYERS_AD_CHANNEL_ID);
                    await channel.messages.delete(adToDelete.messageId);
                } catch (error) { }
            }

            await FreeAgent.deleteOne({ userId: user.id });

            await interaction.editReply({
                content: t('adDeletedSuccess', member),
                embeds: [],
                components: []
            });

        } else if (customId === 'market_edit_ad_button') {
            const existingAd = await FreeAgent.findOne({ userId: user.id });
            if (!existingAd) {
                return interaction.reply({ content: t('errorAdNotFoundForEdit', member), ephemeral: true });
            }
            const modal = new ModalBuilder().setCustomId(`market_agent_modal_edit:${existingAd._id}`).setTitle(t('editAdModalTitle', member));
            const experienceInput = new TextInputBuilder().setCustomId('experienceInput').setLabel(t('agentModalExperienceLabel', member)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(existingAd.experience || '');
            const seekingInput = new TextInputBuilder().setCustomId('seekingInput').setLabel(t('agentModalSeekingLabel', member)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(existingAd.seeking || '');
            const availabilityInput = new TextInputBuilder().setCustomId('availabilityInput').setLabel(t('agentModalAvailabilityLabel', member)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200).setValue(existingAd.availability || '');
            modal.addComponents(new ActionRowBuilder().addComponents(experienceInput), new ActionRowBuilder().addComponents(seekingInput), new ActionRowBuilder().addComponents(availabilityInput));
            await interaction.showModal(modal);
        }
        return;
    }

    if (customId === 'team_manage_offer_button') {
        await interaction.deferReply({ ephemeral: true });

        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: t('errorTeamNotFound', member) });

        const existingOffer = await TeamOffer.findOne({ teamId: team._id });

        if (!existingOffer) {
            return interaction.editReply({ content: t('errorNoOfferToManage', member) });
        }

        const embedTitle = t('manageOfferEmbedTitle', member).replace('{teamName}', team.name);
        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(t('manageOfferEmbedDescription', member))
            .addFields(
                { name: t('offerPositionsField', member), value: `\`${existingOffer.positions.join(', ')}\`` },
                { name: t('offerRequirementsField', member), value: existingOffer.requirements }
            )
            .setColor('Purple');

        const managementRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_post_offer`).setLabel(t('editReplaceOfferButton', member)).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`delete_team_offer_button_${existingOffer._id}`).setLabel(t('deleteOfferButton', member)).setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ embeds: [embed], components: [managementRow] });
        return;
    }

    if (customId.startsWith('delete_team_offer_button_')) {
        await interaction.deferUpdate();
        const offerId = customId.split('_')[4];

        const offerToDelete = await TeamOffer.findById(offerId);
        if (!offerToDelete) return interaction.editReply({ content: 'La oferta ya no existe.', embeds: [], components: [] });

        if (offerToDelete.messageId) {
            try {
                const channelId = process.env.TEAMS_AD_CHANNEL_ID;
                const channel = await client.channels.fetch(channelId);
                await channel.messages.delete(offerToDelete.messageId);
            } catch (error) {
                console.log(`No se pudo borrar el mensaje público de la oferta (ID: ${offerToDelete.messageId}).`);
            }
        }

        await TeamOffer.findByIdAndDelete(offerId);

        await interaction.editReply({
            content: t('offerDeletedSuccess', member),
            embeds: [],
            components: []
        });
        return;
    }

    // --- SISTEMA DE TICKETS ---
    if (customId === 'create_ticket_button') {
        await interaction.deferReply({ ephemeral: true });

        const ticketConfig = await TicketConfig.findOne({ guildId: guild.id });
        if (!ticketConfig) {
            return interaction.editReply({ content: t('errorTicketsNotConfigured', member) });
        }

        const existingTicket = await Ticket.findOne({ userId: user.id, status: { $in: ['open', 'claimed'] } });
        if (existingTicket) {
            return interaction.editReply({ content: t('errorTicketAlreadyOpen', member).replace('{channelId}', existingTicket.channelId) });
        }

        try {
            const ticketChannel = await guild.channels.create({
                name: `ticket-${user.username.replace(/[^a-z0-9-]/g, '')}`,
                type: ChannelType.GuildText,
                parent: process.env.TICKET_CATEGORY_ID || null,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: ticketConfig.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                ],
            });

            // --- CONTENIDO BILINGÜE Y FIJO PARA EL TICKET ---
            const ticketEmbed = new EmbedBuilder()
                .setTitle('🇪🇸 Ticket de Soporte / 🇬🇧 Support Ticket')
                .setDescription(`¡Hola <@${user.id}>! Tu ticket ha sido creado.\n\nPor favor, describe tu problema o duda con el mayor detalle posible. Un miembro del staff te atenderá pronto.\n\n---\n\nHello <@${user.id}>! Your ticket has been created.\n\nPlease describe your problem or question in as much detail as possible. A staff member will assist you shortly.`)
                .setColor('Blue')
                .setFooter({ text: 'Puedes cerrar este ticket en cualquier momento pulsando el botón 🔒. / You can close this ticket at any time by pressing the 🔒 button.' });

            const ticketButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`attend_ticket`).setLabel('Atender / Handle').setStyle(ButtonStyle.Primary).setEmoji('✅'),
                new ButtonBuilder().setCustomId(`close_ticket`).setLabel('Cerrar / Close').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );
            // --------------------------------------------------

            const ticketMessage = await ticketChannel.send({ embeds: [ticketEmbed], components: [ticketButtons] });
            const newTicket = new Ticket({ userId: user.id, channelId: ticketChannel.id, guildId: guild.id, messageId: ticketMessage.id, status: 'open' });

            const logChannel = await guild.channels.fetch(ticketConfig.logChannelId);
            if (logChannel) {
                // El log también es mejor que sea bilingüe
                const staffNotificationEmbed = new EmbedBuilder()
                    .setTitle('🔔 Nuevo Ticket Abierto / New Ticket Opened')
                    .setDescription(`Abierto por / Opened by <@${user.id}>.`)
                    .addFields(
                        { name: 'Ticket', value: `<#${ticketChannel.id}>`, inline: true },
                        { name: 'Estado / Status', value: 'Abierto / Open', inline: true }
                    )
                    .setColor('Green').setTimestamp();

                const staffNotificationButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ir al Ticket / Go to Ticket').setStyle(ButtonStyle.Link).setURL(ticketChannel.url));
                const logMessage = await logChannel.send({ embeds: [staffNotificationEmbed], components: [staffNotificationButtons] });

                newTicket.logMessageId = logMessage.id;
            }

            await newTicket.save();

            // --- RESPUESTA EFÍMERA TRADUCIDA ---
            await interaction.editReply({ content: `✅ ${t('ticketCreatedSuccess', member).replace('{channelId}', ticketChannel.id)}` });

        } catch (error) {
            console.error('Error al crear el ticket:', error);
            await interaction.editReply({ content: '❌ Hubo un error al intentar crear tu ticket. Por favor, inténtalo de nuevo más tarde.' });
        }
        return;
    }
    if (customId === 'attend_ticket') {
        await interaction.deferReply({ ephemeral: true });
        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
        const ticketConfig = await TicketConfig.findOne({ guildId: guild.id });

        if (!ticket) { return interaction.editReply({ content: t('errorTicketInvalid', member) }); }
        if (ticket.status !== 'open') {
            const errorMessage = ticket.status === 'claimed' ? t('errorTicketAlreadyClaimed', member) : t('errorTicketAlreadyClosed', member);
            return interaction.editReply({ content: errorMessage });
        }
        if (!member.roles.cache.has(ticketConfig.supportRoleId) && !isAdmin) { return interaction.editReply({ content: t('errorTicketNoPermission', member) }); }

        ticket.status = 'claimed';
        ticket.claimedBy = user.id;
        await ticket.save();

        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor('Orange').addFields({ name: t('ticketFieldAttendedBy', member), value: `<@${user.id}>` });
        const updatedButtons = ActionRowBuilder.from(interaction.message.components[0]);
        updatedButtons.components[0].setDisabled(true);

        await interaction.message.edit({ embeds: [updatedEmbed], components: [updatedButtons] });
        await interaction.editReply({ content: t('ticketTakenConfirmation', member).replace('{userId}', ticket.userId) });

        if (ticket.logMessageId) {
            try {
                const logChannel = await guild.channels.fetch(ticketConfig.logChannelId);
                const logMessage = await logChannel.messages.fetch(ticket.logMessageId);
                const updatedLogEmbed = EmbedBuilder.from(logMessage.embeds[0])
                    .setTitle(t('ticketLogClaimedTitle', member))
                    .setColor('Orange')
                    .spliceFields(1, 1, { name: t('ticketLogFieldStatus', member), value: t('ticketLogStatusClaimedBy', member).replace('{staffId}', user.id), inline: true });
                await logMessage.edit({ embeds: [updatedLogEmbed] });
            } catch (error) { console.error("Error al editar el mensaje de log (atender):", error); }
        }
        return;
    }

    if (customId === 'close_ticket') {
        await interaction.deferReply({ ephemeral: true });
        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
        const ticketConfig = await TicketConfig.findOne({ guildId: guild.id });

        if (!ticket) { return interaction.editReply({ content: t('errorTicketInvalid', member) }); }
        if (ticket.status === 'closed') { return interaction.editReply({ content: t('errorTicketAlreadyClosed', member) }); }

        const canClose = member.roles.cache.has(ticketConfig.supportRoleId) || isAdmin || ticket.userId === user.id;
        if (!canClose) { return interaction.editReply({ content: t('errorTicketNoPermission', member) }); }

        ticket.status = 'closed';
        await ticket.save();

        await interaction.channel.send({ content: t('ticketClosingMessage', member) });

        if (ticket.logMessageId) {
            try {
                const logChannel = await guild.channels.fetch(ticketConfig.logChannelId);
                const logMessage = await logChannel.messages.fetch(ticket.logMessageId);
                const updatedLogEmbed = EmbedBuilder.from(logMessage.embeds[0])
                    .setTitle(t('ticketLogClosedTitle', member))
                    .setColor('Red')
                    .setDescription(t('ticketLogClosedDescription', member).replace('{userId}', ticket.userId).replace('{staffId}', user.id));
                await logMessage.edit({ embeds: [updatedLogEmbed], components: [] });
            } catch (error) { console.error("Error al editar el mensaje de log (cerrar):", error); }
        }

        setTimeout(async () => {
            try { await interaction.channel.delete(); }
            catch (err) { console.error(`Error al eliminar el canal del ticket ${ticket.channelId}:`, err); }
        }, 10000);

        return interaction.editReply({ content: t('ticketClosingConfirmation', member) });
    }
    if (customId.startsWith('select_lang_')) {
        await interaction.deferReply({ ephemeral: true });

        const langCode = customId.split('_')[2];

        const langToRole = {
            'es': '1392409960322826270',
            'en': '1392410199490302043',
            'it': '1392410102706737282',
            'fr': '1392410295044931746',
            'pt': '1392410361063276575',
            'de': '1392410401391775814',
            'tr': '1392410445578637342',
        };

        const allLangRoleIds = Object.values(langToRole);
        const targetRoleId = langToRole[langCode];

        if (!targetRoleId) {
            return interaction.editReply({ content: 'Error: Código de idioma no válido.' });
        }

        const rolesToRemove = member.roles.cache
            .filter(role => allLangRoleIds.includes(role.id))
            .map(role => role.id);

        try {
            if (rolesToRemove.length > 0) {
                await member.roles.remove(rolesToRemove);
            }
            await member.roles.add(targetRoleId);

            // Forzamos la obtención del miembro actualizado para que el traductor use el nuevo rol
            const updatedMember = await interaction.guild.members.fetch(user.id);
            const confirmationMessage = t('langSetSuccess', updatedMember);

            await interaction.editReply({ content: confirmationMessage });

        } catch (error) {
            console.error(`Error al cambiar el rol de idioma para ${user.tag}:`, error);
            await interaction.editReply({ content: '❌ Ocurrió un error al cambiar tu rol. Por favor, asegúrate de que tengo permisos para gestionar roles.' });
        }
        return;
    }
};


// Exportamos el handler y las funciones de utilidad para que puedan ser usadas en otros archivos.
handler.updatePanelMessage = updatePanelMessage;
handler.getOrCreateWebhook = getOrCreateWebhook;
handler.sendPaginatedTeamMenu = sendPaginatedTeamMenu;
handler.sendPaginatedPlayerMenu = sendPaginatedPlayerMenu;
module.exports = handler;
