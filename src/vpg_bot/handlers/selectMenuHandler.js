// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const Team = require('../models/team.js');
const mongoose = require('mongoose');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');
const t = require('../utils/translator.js');
const { updatePanelMessage, getOrCreateWebhook } = require('./buttonHandler.js');


const POSITION_KEYS = ['GK', 'CB', 'WB', 'CDM', 'CM', 'CAM', 'ST'];

module.exports = async (client, interaction) => {
    const { customId, values, guild, user, member } = interaction;
    const selectedValue = values[0];

    if (customId === 'registration_select_platform_step1') {
        let member = interaction.member;
        if (!member) {
            try {
                const guild = await client.guilds.fetch(process.env.GUILD_ID);
                member = await guild.members.fetch(user.id);
            } catch (e) {
                return interaction.update({ content: 'Error: No pude encontrarte en el servidor principal.', components: [] });
            }
        }
        const platform = selectedValue;

        if (platform === 'pc') {
            const pcPlatformMenu = new StringSelectMenuBuilder()
                .setCustomId('registration_select_platform_pc_step2')
                .setPlaceholder(t('registrationPCPlaceholder', interaction.member))
                .addOptions([
                    { label: t('platformSteam', interaction.member), value: 'steam' },
                    { label: t('platformEAApp', interaction.member), value: 'ea_app' },
                ]);

            const row = new ActionRowBuilder().addComponents(pcPlatformMenu);
            return interaction.update({ content: t('registrationPCStep2Title', interaction.member), components: [row] });

        } else {
            const modal = new ModalBuilder()
                .setCustomId(`unified_registration_modal_${platform}`)
                .setTitle(t('registrationFinalModalTitle', interaction.member));

            const gameIdInput = new TextInputBuilder().setCustomId('gameIdInput').setLabel(t('registrationGameIdLabel', interaction.member)).setStyle(TextInputStyle.Short).setRequired(true);
            const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsernameInput').setLabel(t('registrationVPGUsernameLabel', interaction.member)).setStyle(TextInputStyle.Short).setRequired(true);
            const twitterInput = new TextInputBuilder().setCustomId('twitterInput').setLabel(t('registrationTwitterLabel', interaction.member)).setStyle(TextInputStyle.Short).setRequired(true);
            const whatsappInput = new TextInputBuilder().setCustomId('whatsappInput').setLabel(t('registrationWhatsappLabel', interaction.member)).setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(gameIdInput),
                new ActionRowBuilder().addComponents(vpgUsernameInput),
                new ActionRowBuilder().addComponents(twitterInput),
                new ActionRowBuilder().addComponents(whatsappInput)
            );

            return interaction.showModal(modal);
        }
    }

    if (customId === 'registration_select_platform_pc_step2') {
        let member = interaction.member;
        if (!member) {
            try {
                const guild = await client.guilds.fetch(process.env.GUILD_ID);
                member = await guild.members.fetch(user.id);
            } catch (e) {
                return interaction.update({ content: 'Error: No pude encontrarte en el servidor principal.', components: [] });
            }
        }
        const platform = selectedValue;

        const modal = new ModalBuilder()
            .setCustomId(`unified_registration_modal_${platform}`)
            .setTitle(t('registrationFinalModalTitle', interaction.member));

        const gameIdInput = new TextInputBuilder().setCustomId('gameIdInput').setLabel(t('registrationGameIdLabel', interaction.member)).setStyle(TextInputStyle.Short).setRequired(true);
        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsernameInput').setLabel(t('registrationVPGUsernameLabel', interaction.member)).setStyle(TextInputStyle.Short).setRequired(true);
        const twitterInput = new TextInputBuilder().setCustomId('twitterInput').setLabel(t('registrationTwitterLabel', interaction.member)).setStyle(TextInputStyle.Short).setRequired(true);
        const whatsappInput = new TextInputBuilder().setCustomId('whatsappInput').setLabel(t('registrationWhatsappLabel', interaction.member)).setStyle(TextInputStyle.Short).setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gameIdInput),
            new ActionRowBuilder().addComponents(vpgUsernameInput),
            new ActionRowBuilder().addComponents(twitterInput),
            new ActionRowBuilder().addComponents(whatsappInput)
        );

        return interaction.showModal(modal);
    }

    if (customId.startsWith('admin_select_new_manager_')) {
        await interaction.deferUpdate();

        const teamId = customId.split('_')[4];
        const newManagerId = values[0];

        const team = await Team.findById(teamId);
        if (!team) return interaction.followUp({ content: '❌ El equipo ya no existe.', flags: MessageFlags.Ephemeral });
        if (team.managerId === newManagerId) return interaction.editReply({ content: '⚠️ Has seleccionado al mánager actual. No se ha realizado ningún cambio.', components: [] });

        const isAlreadyManager = await Team.findOne({ managerId: newManagerId });
        if (isAlreadyManager) {
            return interaction.followUp({ content: `❌ El usuario seleccionado ya es mánager del equipo **${isAlreadyManager.name}**.`, flags: MessageFlags.Ephemeral });
        }

        const oldManagerId = team.managerId;

        // Creamos un menú de selección en lugar de botones
        const actionMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_finalize_manager_action_${teamId}_${oldManagerId}_${newManagerId}`)
            .setPlaceholder('Elige una acción para el antiguo mánager')
            .addOptions([
                { label: 'Degradar a Capitán', value: 'captain', emoji: '🛡️' },
                { label: 'Degradar a Jugador', value: 'player', emoji: '👥' },
                { label: 'Expulsar del Equipo', value: 'kick', emoji: '🚪' },
            ]);

        await interaction.editReply({
            content: `Has seleccionado a <@${newManagerId}> como nuevo mánager.\n\n**Paso final: ¿Qué quieres hacer con el mánager actual, <@${oldManagerId}>?**`,
            components: [new ActionRowBuilder().addComponents(actionMenu)]
        });
        return;
    }
    if (customId.startsWith('admin_finalize_manager_action_')) {
        await interaction.deferUpdate();

        const parts = customId.split('_');
        const teamId = parts[4];
        const oldManagerId = parts[5];
        const newManagerId = parts[6];
        const action = values[0]; // 'captain', 'player', o 'kick'

        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: '❌ El equipo ya no existe.', components: [] });

        const oldManagerMember = await interaction.guild.members.fetch(oldManagerId).catch(() => null);
        const newManagerMember = await interaction.guild.members.fetch(newManagerId).catch(() => null);

        if (!newManagerMember) return interaction.editReply({ content: '❌ El nuevo mánager seleccionado ya no se encuentra en el servidor.', components: [] });

        let outcomeMessage = '';

        if (oldManagerMember) {
            await oldManagerMember.roles.remove(process.env.MANAGER_ROLE_ID);
            if (action === 'captain') {
                team.captains.push(oldManagerId);
                await oldManagerMember.roles.add([process.env.CAPTAIN_ROLE_ID, process.env.PLAYER_ROLE_ID]);
                await oldManagerMember.setNickname(`|C| ${team.abbreviation} ${oldManagerMember.user.username}`).catch(() => { });
                outcomeMessage = `<@${oldManagerId}> ha sido degradado a **Capitán**.`;
            } else if (action === 'player') {
                team.players.push(oldManagerId);
                await oldManagerMember.roles.add(process.env.PLAYER_ROLE_ID);
                await oldManagerMember.setNickname(`${team.abbreviation} ${oldManagerMember.user.username}`).catch(() => { });
                outcomeMessage = `<@${oldManagerId}> ha sido degradado a **Jugador**.`;
            } else if (action === 'kick') {
                await oldManagerMember.roles.remove([process.env.CAPTAIN_ROLE_ID, process.env.PLAYER_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => { });
                if (oldManagerMember.id !== interaction.guild.ownerId) await oldManagerMember.setNickname(oldManagerMember.user.username).catch(() => { });
                outcomeMessage = `<@${oldManagerId}> ha sido **expulsado** del equipo.`;
            }
            await oldManagerMember.send(`Un administrador ha modificado tu estatus en el equipo **${team.name}**.`).catch(() => { });
        } else {
            outcomeMessage = `El antiguo mánager <@${oldManagerId}> no se encontró en el servidor, solo se actualizó la base de datos.`;
        }

        team.managerId = newManagerId;
        
        let idsToPull = [newManagerId];
        if (action === 'kick') {
            idsToPull.push(oldManagerId);
        }
        
        await mongoose.connection.client.db('test').collection('teams').updateOne(
            { _id: team._id },
            { 
                $set: { managerId: newManagerId },
                $pull: { captains: { $in: idsToPull }, players: { $in: idsToPull } }
            }
        );

        await newManagerMember.roles.add([process.env.MANAGER_ROLE_ID, process.env.PLAYER_ROLE_ID]);
        await newManagerMember.roles.remove(process.env.CAPTAIN_ROLE_ID).catch(() => { });
        await newManagerMember.setNickname(`|MG| ${team.abbreviation} ${newManagerMember.user.username}`).catch(() => { });

        await newManagerMember.send(`¡Enhorabuena! Un administrador te ha asignado como nuevo Mánager de **${team.name}**.`).catch(() => { });

        await interaction.editReply({
            content: `✅ **¡Cambio de mánager completado!**\n- <@${newManagerId}> es ahora el nuevo mánager de **${team.name}**.\n- ${outcomeMessage}`,
            components: []
        });
        return;
    }

    if (customId === 'admin_select_manager_for_creation') {
        const managerId = values[0];

        const isAlreadyInTeam = await Team.findOne({ guildId: interaction.guild.id, $or: [{ managerId }, { captains: managerId }, { players: managerId }] });
        if (isAlreadyInTeam) {
            return interaction.update({ content: `❌ El usuario seleccionado ya pertenece al equipo **${isAlreadyInTeam.name}**.`, components: [] });
        }

        // Buscamos las ligas existentes
        const leagues = await League.find({ guildId: interaction.guild.id });
        if (leagues.length === 0) {
            return interaction.update({ content: '❌ No hay ligas creadas. Por favor, crea una liga antes de crear un equipo.', components: [] });
        }

        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));

        const leagueMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_league_for_creation_${managerId}`)
            .setPlaceholder('Selecciona la liga para el nuevo equipo')
            .addOptions(leagueOptions);

        await interaction.update({
            content: `Has seleccionado a <@${managerId}> como Mánager.\n\n**Paso 2 de 3:** Ahora, selecciona la liga en la que competirá el equipo.`,
            components: [new ActionRowBuilder().addComponents(leagueMenu)]
        });
        return;
    }
    if (customId.startsWith('admin_select_league_for_creation_')) {
        const managerId = customId.split('_')[5];
        const leagueName = values[0];

        const modal = new ModalBuilder()
            .setCustomId(`admin_create_team_modal_${managerId}_${leagueName.replace(/\s/g, '-')}`)
            .setTitle(`Crear equipo en la liga ${leagueName}`);

        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre del equipo").setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        // --- NUEVO CAMPO AÑADIDO ---
        const teamTwitterInput = new TextInputBuilder().setCustomId('teamTwitter').setLabel("Twitter del equipo (opcional, sin @)").setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(teamNameInput),
            new ActionRowBuilder().addComponents(teamAbbrInput),
            // --- NUEVA FILA AÑADIDA AL FORMULARIO ---
            new ActionRowBuilder().addComponents(teamTwitterInput)
        );

        await interaction.showModal(modal);
        return;
    }
    if (customId.startsWith('admin_select_members_')) {
        await interaction.deferUpdate();
        const parts = customId.split('_');
        const roleToAdd = parts[3]; // 'captains' o 'players'
        const teamId = parts[4];
        const selectedUserIds = values;

        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: '❌ El equipo ya no existe.', components: [] });

        let addedCount = 0;
        let failedUsernames = [];

        for (const userId of selectedUserIds) {
            const isAlreadyInTeam = await Team.findOne({ guildId: interaction.guild.id, $or: [{ managerId: userId }, { captains: userId }, { players: userId }] });
            if (isAlreadyInTeam) {
                const member = await guild.members.fetch(userId).catch(() => ({ user: { username: 'Usuario Desconocido' } }));
                failedUsernames.push(`${member.user.username} (en ${isAlreadyInTeam.name})`);
                continue;
            }

            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
                if (roleToAdd === 'captains') {
                    team.captains.push(userId);
                    await member.roles.add([process.env.CAPTAIN_ROLE_ID, process.env.PLAYER_ROLE_ID]);
                    await member.setNickname(`|C| ${team.abbreviation} ${member.user.username}`).catch(() => { });
                } else {
                    team.players.push(userId);
                    await member.roles.add(process.env.PLAYER_ROLE_ID);
                    await member.setNickname(`${team.abbreviation} ${member.user.username}`).catch(() => { });
                }
                addedCount++;
            }
        }

        await team.save();

        let responseMessage = `✅ Se han añadido **${addedCount}** nuevos ${roleToAdd === 'captains' ? 'capitanes' : 'jugadores'} al equipo **${team.name}**.`;
        if (failedUsernames.length > 0) {
            responseMessage += `\n\n⚠️ Los siguientes usuarios no se pudieron añadir porque ya pertenecen a otro equipo: ${failedUsernames.join(', ')}.`;
        }

        await interaction.editReply({ content: responseMessage, components: [] });
        return;
    }

    if (customId === 'invite_player_select') {
        await interaction.deferUpdate();
        const targetId = selectedValue;
        const member = interaction.member; // Para saber el idioma del mánager

        const team = await Team.findOne({ guildId: guild.id, managerId: user.id });
        if (!team) {
            return interaction.editReply({ content: 'No se ha encontrado tu equipo o ya no eres el mánager.', components: [] });
        }

        const targetMember = await guild.members.fetch(targetId).catch(() => null);
        if (!targetMember) {
            return interaction.editReply({ content: 'El miembro seleccionado ya no se encuentra en el servidor.', components: [] });
        }

        const isAlreadyInTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: targetMember.id }, { captains: targetMember.id }, { players: targetMember.id }] });
        if (isAlreadyInTeam) {
            return interaction.editReply({ content: `❌ No puedes invitar a **${targetMember.user.tag}** porque ya está en el equipo **${isAlreadyInTeam.name}**.`, components: [] });
        }

        // El MD al jugador se envía bilingüe, ya que no sabemos su idioma.
        const embed = new EmbedBuilder()
            .setTitle(`📩 Team Invitation / Invitación de Equipo`)
            .setDescription(`You have been invited to join **${team.name}**.\n\nHas sido invitado a unirte a **${team.name}**.`)
            .setColor('Green').setThumbnail(team.logoUrl);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_invite_${team._id}_${targetMember.id}`).setLabel('Accept / Aceptar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_invite_${team._id}_${targetMember.id}`).setLabel('Decline / Rechazar').setStyle(ButtonStyle.Danger)
        );

        try {
            await targetMember.send({ embeds: [embed], components: [row] });
            const successMessage = t('inviteSentSuccess', member).replace('{playerName}', targetMember.user.tag);
            return interaction.editReply({ content: successMessage, components: [] });
        } catch (error) {
            const failMessage = t('inviteSentFail', member).replace('{playerName}', targetMember.user.tag);
            return interaction.editReply({ content: failMessage, components: [] });
        }
    }
    if (customId === 'update_select_primary_position') {
        await interaction.deferUpdate();
        const selectedPosition = values[0];
        const member = interaction.member;
        await VPGUser.findOneAndUpdate({ discordId: user.id }, { primaryPosition: selectedPosition }, { upsert: true });

        const positionOptions = POSITION_KEYS.map(p => ({
            label: t(`pos_${p}`, member),
            value: p
        }));

        const secondaryMenu = new StringSelectMenuBuilder()
            .setCustomId('update_select_secondary_position')
            .setPlaceholder(t('secondaryPositionPlaceholder', member))
            .addOptions({ label: t('noSecondaryPosition', member), value: 'NINGUNA' }, ...positionOptions);

        await interaction.editReply({
            content: t('primaryPositionSaved', member),
            components: [new ActionRowBuilder().addComponents(secondaryMenu)]
        });
        return;
    }

    if (customId === 'update_select_secondary_position') {
        const selectedPosition = values[0];
        const member = interaction.member;
        await VPGUser.findOneAndUpdate({ discordId: user.id }, { secondaryPosition: selectedPosition === 'NINGUNA' ? null : selectedPosition }, { upsert: true });

        const userProfile = await VPGUser.findOne({ discordId: user.id }).lean();

        const modal = new ModalBuilder().setCustomId('edit_profile_modal').setTitle(t('updateProfileModalTitle', member));

        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsernameInput').setLabel(t('vpgUsernameLabel', member)).setStyle(TextInputStyle.Short).setRequired(false).setValue(userProfile.vpgUsername || '');
        const twitterInput = new TextInputBuilder().setCustomId('twitterInput').setLabel(t('playerTwitterLabel', member)).setStyle(TextInputStyle.Short).setRequired(false).setValue(userProfile.twitterHandle || '');
        const psnIdInput = new TextInputBuilder().setCustomId('psnIdInput').setLabel(t('psnIdLabel', member)).setStyle(TextInputStyle.Short).setRequired(false).setValue(userProfile.psnId || '');
        const eaIdInput = new TextInputBuilder().setCustomId('eaIdInput').setLabel(t('eaIdLabel', member)).setStyle(TextInputStyle.Short).setRequired(false).setValue(userProfile.eaId || '');

        modal.addComponents(
            new ActionRowBuilder().addComponents(vpgUsernameInput),
            // --- CORRECCIÓN: Se ha corregido el typo "ActionRowRowBuilder" a "ActionRowBuilder" ---
            new ActionRowBuilder().addComponents(twitterInput),
            new ActionRowBuilder().addComponents(psnIdInput),
            new ActionRowBuilder().addComponents(eaIdInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (customId === 'search_team_pos_filter' || customId === 'search_team_league_filter') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const filter = { guildId: guild.id, status: 'ACTIVE' };

        // NOTA: Esta lógica asume que solo se puede filtrar por una cosa a la vez.
        // Si en el futuro se quiere filtrar por liga Y posición, habría que guardar el estado del filtro.
        if (selectedValue !== 'ANY') {
            if (customId === 'search_team_pos_filter') filter.positions = selectedValue;
            if (customId === 'search_team_league_filter') filter['teamId.league'] = selectedValue;
        }

        const offers = await TeamOffer.find(filter).populate('teamId').limit(10);
        if (offers.length === 0) {
            return interaction.editReply({ content: t('errorNoOffersFound', member) });
        }

        await interaction.editReply({ content: t('offersFoundSuccess', member).replace('{count}', offers.length) });
        for (const offer of offers) {
            const offerEmbed = new EmbedBuilder()
                .setAuthor({ name: offer.teamId.name, iconURL: offer.teamId.logoUrl })
                .setThumbnail(offer.teamId.logoUrl)
                .setColor('Green')
                .addFields(
                    { name: t('offerFieldPositions', member), value: `\`${offer.positions.join(', ')}\`` },
                    { name: t('offerFieldRequirements', member), value: offer.requirements },
                    { name: t('offerFieldContact', member), value: `<@${offer.postedById}>` }
                );
            await interaction.followUp({ embeds: [offerEmbed], flags: MessageFlags.Ephemeral });
        }
        return;
    }

    if (customId === 'search_player_pos_filter') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const selectedPositions = values;
        const profiles = await VPGUser.find({ 'primaryPosition': { $in: selectedPositions } }).lean();
        if (profiles.length === 0) {
            return interaction.editReply({ content: 'No se encontraron jugadores con esas posiciones.' });
        }
        const profileUserIds = profiles.map(p => p.discordId);
        const agents = await FreeAgent.find({ guildId: guild.id, status: 'ACTIVE', userId: { $in: profileUserIds } });
        if (agents.length === 0) {
            return interaction.editReply({ content: 'Se encontraron jugadores con esas posiciones, pero ninguno está anunciado como agente libre ahora mismo.' });
        }

        await interaction.editReply({ content: `✅ ¡Búsqueda exitosa! Se encontraron ${agents.length} agentes libres. Te los enviaré a continuación...` });

        const agentUserIds = agents.map(a => a.userId);
        const members = guild.members.cache;

        for (const agent of agents) {
            const profile = profiles.find(p => p.discordId === agent.userId);
            const member = members.get(agent.userId);
            if (!member || !profile) continue;

            const playerEmbed = new EmbedBuilder()
                .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                .setThumbnail(member.user.displayAvatarURL())
                .setColor('Blue')
                .addFields(
                    { name: 'Posiciones', value: `**${profile.primaryPosition}** / ${profile.secondaryPosition || 'N/A'}`, inline: true },
                    { name: 'VPG / Twitter', value: `${profile.vpgUsername || 'N/A'} / @${profile.twitterHandle || 'N/A'}`, inline: true },
                    { name: 'Disponibilidad', value: agent.availability || 'No especificada', inline: false },
                    { name: 'Experiencia', value: agent.experience || 'Sin descripción.' },
                    { name: 'Busco un equipo que...', value: agent.seeking || 'Sin descripción.' }
                )
                .setFooter({ text: `Puedes contactar directamente con este jugador.` });
            await interaction.followUp({ embeds: [playerEmbed], flags: MessageFlags.Ephemeral });
        }
        return;
    }

    if (customId.startsWith('offer_select_positions_')) {
        const teamId = customId.split('_')[3];
        const selectedPositions = values;
        const member = interaction.member; // Para el traductor

        const modal = new ModalBuilder()
            .setCustomId(`offer_add_requirements_${teamId}_${selectedPositions.join('-')}`)
            .setTitle(t('offerStep2Title', member));
        const requirementsInput = new TextInputBuilder()
            .setCustomId('requirementsInput')
            .setLabel(t('offerRequirementsLabel', member))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder(t('offerRequirementsPlaceholder', member));
        modal.addComponents(new ActionRowBuilder().addComponents(requirementsInput));
        await interaction.showModal(modal);
        return;
    }

    if (customId === 'apply_to_team_select') {
        const teamId = selectedValue;
        const member = interaction.member;
        // --- CORRECCIÓN: Usamos el traductor ---
        const modal = new ModalBuilder().setCustomId(`application_modal_${teamId}`).setTitle(t('applyToTeamModalTitle', member));
        const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel(t('applicationPresentationLabel', member)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        await interaction.showModal(modal);
        return;
    }

    // ===========================================================================
    // ================== ESTE BLOQUE ES EL QUE SE HA CORREGIDO ==================
    // ===========================================================================
    if (customId === 'select_league_for_registration') {
        const leagueName = selectedValue;
        const member = interaction.member; // Obtenemos el 'member' para pasarlo al traductor

        const modalTitle = t('registerModalTitle', member).replace('{leagueName}', leagueName);
        const modal = new ModalBuilder().setCustomId(`manager_request_modal_${leagueName}`).setTitle(modalTitle);

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

        await interaction.showModal(modal);
        return;
    }

    if (customId.startsWith('link_ea_select_')) {
        await interaction.deferUpdate();
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        
        if (!team) return interaction.followUp({ content: '❌ El equipo ya no existe.', flags: MessageFlags.Ephemeral });

        const [eaClubId, eaPlatform] = values[0].split('|');

        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        if (!approvalChannelId) return interaction.followUp({ content: '❌ El canal de aprobaciones no está configurado.', flags: MessageFlags.Ephemeral });

        const approvalChannel = await interaction.client.channels.fetch(approvalChannelId).catch(() => null);
        if (!approvalChannel) return interaction.followUp({ content: '❌ No se pudo encontrar el canal de aprobaciones.', flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder()
            .setTitle('Solicitud de Vinculación con EA Sports')
            .setColor('Yellow')
            .addFields(
                { name: '👤 Solicitante', value: `<@${interaction.user.id}>`, inline: true },
                { name: '🛡️ Equipo VPG', value: `${team.name}`, inline: true },
                { name: '🎮 Club ID EA', value: `${eaClubId}`, inline: true },
                { name: '🖥️ Plataforma EA', value: `${eaPlatform}`, inline: true }
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve_ealink_${teamId}_${eaClubId}_${eaPlatform}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_ealink_${teamId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

        await approvalChannel.send({ embeds: [embed], components: [row] });

        return interaction.followUp({ 
            content: `⏳ **¡Solicitud enviada!**\n\nTu petición para vincular el equipo al Club ID de EA \`${eaClubId}\` ha sido enviada a los administradores para su revisión y aprobación.`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (customId.startsWith('select_league_filter_')) {
        await interaction.deferUpdate();
        const panelType = customId.split('_')[3];
        const selectedLeagues = values;
        const leaguesString = selectedLeagues.length > 0 ? selectedLeagues.join(',') : 'none';

        const continueButton = new ButtonBuilder()
            .setCustomId(`continue_panel_creation_${panelType}_${leaguesString}`)
            .setLabel(t('continuePanelCreationButtonLabel', member))
            .setStyle(ButtonStyle.Success);

        const leaguesText = selectedLeagues.length > 0 ? selectedLeagues.join(', ') : t('leaguesSelectedNone', member);
        const confirmationText = t('leaguesSelectedConfirmation', member).replace('{leagues}', leaguesText);

        await interaction.editReply({
            content: confirmationText,
            components: [new ActionRowBuilder().addComponents(continueButton)]
        });
        return;
    }

    if (customId === 'admin_select_team_to_manage') {
        await interaction.deferUpdate();
        const teamId = selectedValue;
        const team = await Team.findById(teamId).lean();
        if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.', components: [], embeds: [] });

        const leagues = await League.find({ guildId: guild.id }).sort({ name: 1 });
        const leagueOptions = leagues.map(l => ({ label: l.name, value: `admin_set_league_${teamId}_${l._id}`, default: team.league === l.name }));

        const leagueMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_change_league_menu')
            .setPlaceholder('Cambiar la liga del equipo')
            .addOptions(leagueOptions);

        const embed = new EmbedBuilder().setTitle(`Gestión: ${team.name}`).setColor('DarkRed').setThumbnail(team.logoUrl)
            .addFields({ name: '📊 ELO', value: `${team.elo || 1000}`, inline: true });
            
        if (team.eaClubId) {
            embed.addFields({ name: '🎮 Club de EA Vinculado', value: `ID: \`${team.eaClubId}\`\nConsola: \`${team.eaPlatform}\``, inline: false });
        } else {
            embed.addFields({ name: '🎮 Club de EA Vinculado', value: `❌ Sin vincular`, inline: false });
        }
            
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_change_data_${teamId}`).setLabel('Cambiar Datos').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Primary),
            // --- ESTE ES EL NUEVO BOTÓN ---
            new ButtonBuilder().setCustomId(`admin_change_manager_${teamId}`).setLabel('Cambiar Mánager').setStyle(ButtonStyle.Primary).setEmoji('👑'),
            // --- BOTÓN ELO ---
            new ButtonBuilder().setCustomId(`admin_edit_elo_${teamId}`).setLabel('Editar ELO').setStyle(ButtonStyle.Secondary).setEmoji('📊')
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_dissolve_team_${teamId}`).setLabel('DISOLVER EQUIPO').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`admin_link_ea_${teamId}`).setLabel('Vincular EA').setStyle(ButtonStyle.Success).setEmoji('🎮'),
            new ButtonBuilder().setCustomId(`admin_unlink_ea_${teamId}`).setLabel('Desvincular EA').setStyle(ButtonStyle.Danger).setEmoji('❌')
        );
        const row3 = new ActionRowBuilder().addComponents(leagueMenu);

        await interaction.editReply({ content: '', embeds: [embed], components: [row1, row2, row3] });
        return;
    }

    if (customId === 'roster_management_menu') {
        await interaction.deferUpdate();
        const targetId = selectedValue;
        const member = interaction.member; // Para el traductor
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });

        if (!team) {
            const adminTeam = await Team.findOne({ 'players': targetId });
            if (!adminTeam || !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                // Error interno, no necesita traducción por ahora
                return interaction.editReply({ content: "No tienes permisos sobre este equipo.", components: [] });
            }
        }
        const managerTeam = team || await Team.findOne({ players: { $in: [targetId] }, guildId: guild.id });

        const isManagerAction = managerTeam.managerId === user.id || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const targetMember = await guild.members.fetch(targetId).catch(() => null);
        if (!targetMember) return interaction.editReply({ content: "El miembro seleccionado ya no está en el servidor.", components: [] });

        const isTargetCaptain = managerTeam.captains.includes(targetId);
        const row = new ActionRowBuilder();

        if (isManagerAction) {
            if (isTargetCaptain) {
                row.addComponents(new ButtonBuilder().setCustomId(`demote_captain_${targetId}`).setLabel(t('demoteToPlayerButton', member)).setStyle(ButtonStyle.Secondary));
            } else if (managerTeam.players.includes(targetId)) {
                row.addComponents(new ButtonBuilder().setCustomId(`promote_player_${targetId}`).setLabel(t('promoteToCaptainButton', member)).setStyle(ButtonStyle.Success));
            }
        }

        if (managerTeam.managerId !== targetId) {
            row.addComponents(new ButtonBuilder().setCustomId(`kick_player_${targetId}`).setLabel(t('kickFromTeamButton', member)).setStyle(ButtonStyle.Danger));
        }

        row.addComponents(new ButtonBuilder().setCustomId(`toggle_mute_player_${targetId}`).setLabel(t('toggleChatMuteButton', member)).setStyle(ButtonStyle.Secondary));

        const headerText = t('actionsForPlayer', member).replace('{playerName}', targetMember.user.username);
        await interaction.editReply({ content: headerText, components: [row] });
        return;
    }

    if (customId === 'admin_change_league_menu') {
        await interaction.deferUpdate();
        const parts = selectedValue.split('_');
        const teamId = parts[3];
        const leagueId = parts[4];
        const team = await Team.findById(teamId);
        const league = await League.findById(leagueId);
        if (!team || !league) return interaction.followUp({ content: 'El equipo o la liga ya no existen.', flags: MessageFlags.Ephemeral });
        team.league = league.name;
        await team.save();
        await interaction.followUp({ content: `✅ La liga del equipo **${team.name}** ha sido cambiada a **${league.name}**.`, flags: MessageFlags.Ephemeral });
        return;
    }

    if (customId === 'view_team_roster_select') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findById(selectedValue).lean();
        if (!team) return interaction.editReply({ content: t('errorTeamNoLongerExists', member) });

        const allMemberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
        if (allMemberIds.length === 0) return interaction.editReply({ content: t('errorTeamHasNoMembers', member) });

        const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } }).lean();
        const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));

        let rosterString = '';
        const fetchMemberInfo = async (ids, roleName) => {
            if (!ids || ids.length === 0) return;
            rosterString += `\n**${roleName}**\n`;
            for (const memberId of ids) {
                try {
                    const memberData = guild.members.cache.get(memberId) || await guild.members.fetch(memberId);
                    const profile = memberMap.get(memberId);
                    let positionString = profile?.primaryPosition ? ` - ${profile.primaryPosition}` : '';
                    if (profile?.secondaryPosition) { positionString += ` / ${profile.secondaryPosition}`; }
                    const vpgUsername = profile?.vpgUsername || 'N/A';
                    const twitterInfo = profile?.twitterHandle ? ` (@${profile.twitterHandle})` : '';
                    rosterString += `> ${memberData.user.username} (${vpgUsername})${positionString}${twitterInfo}\n`;
                } catch (error) { rosterString += `> *Usuario no encontrado (ID: ${memberId})*\n`; }
            }
        };

        // --- LÍNEAS CORREGIDAS ---
        await fetchMemberInfo([team.managerId].filter(Boolean), t('rosterManager', member));
        await fetchMemberInfo(team.captains, t('rosterCaptains', member));
        await fetchMemberInfo(team.players, t('rosterPlayers', member));

        const embedTitle = t('rosterEmbedTitle', member).replace('{teamName}', team.name);
        const embedFooter = t('rosterLeague', member).replace('{leagueName}', team.league);

        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(rosterString.trim() || t('rosterNoMembers', member))
            .setColor('#3498db')
            .setThumbnail(team.logoUrl)
            .setFooter({ text: embedFooter });

        return interaction.editReply({ embeds: [embed] });
    }

    if (customId === 'delete_league_select_menu') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const leaguesToDelete = values;
        const result = await League.deleteMany({ guildId: guild.id, name: { $in: leaguesToDelete } });
        return interaction.editReply({ content: t('leaguesDeletedSuccess', member).replace('{count}', result.deletedCount) });
    }

    if (customId === 'register_select_primary_position' || customId === 'register_select_secondary_position') {
        await interaction.deferUpdate();
        const isPrimary = customId === 'register_select_primary_position';
        const position = values[0];

        const update = isPrimary
            ? { primaryPosition: position }
            : { secondaryPosition: position === 'NINGUNA' ? null : position };

        const userProfile = await VPGUser.findOneAndUpdate({ discordId: user.id }, update, { new: true, upsert: true });

        if (userProfile && userProfile.primaryPosition && userProfile.secondaryPosition !== undefined) {
            try {
                const member = interaction.member;
                if (!member) throw new Error('No se pudo encontrar al miembro en el servidor.');

                const playerRole = await guild.roles.fetch(process.env.PLAYER_ROLE_ID);
                if (playerRole) {
                    await member.roles.add(playerRole);
                }

                await interaction.editReply({
                    content: '✅ **¡Registro completado!** Has recibido el rol de Jugador en el servidor. ¡Bienvenido!',
                    components: []
                });

            } catch (err) {
                console.error("Error al finalizar registro y asignar rol:", err);
                await interaction.editReply({
                    content: 'Tu perfil se ha guardado, pero hubo un error al asignarte el rol en el servidor. Por favor, contacta a un administrador.',
                    components: []
                });
            }
        }
        return;
    }

    if (customId.startsWith('select_available_times_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const selectedTimes = values;
        const leaguesString = customId.split('_').slice(3).join('_');
        const leagues = leaguesString === 'all' || leaguesString === 'none' ? [] : leaguesString.split(',');

        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: t('errorTeamNotFound', member) });

        const channelId = process.env.SCHEDULED_FRIENDLY_CHANNEL_ID;
        if (!channelId) return interaction.editReply({ content: t('errorScheduledChannelNotSet', member) });

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: t('errorScheduledChannelNotFound', member) });

        const initialEmbed = new EmbedBuilder().setTitle(`Buscando Rival - ${team.name} (Disponible)`).setColor("Greyple");
        const webhook = await getOrCreateWebhook(channel, client);
        const message = await webhook.send({ embeds: [initialEmbed], username: team.name, avatarURL: team.logoUrl });

        const timeSlots = selectedTimes.map(time => ({
            time,
            status: 'AVAILABLE'
        }));

        const panel = new AvailabilityPanel({
            guildId: guild.id, channelId, messageId: message.id, teamId: team._id,
            postedById: user.id, panelType: 'SCHEDULED', leagues, timeSlots
        });

        await panel.save();
        await updatePanelMessage(client, panel._id);

        const successMessage = t('scheduledPanelCreatedSuccess', member).replace('{channel}', channel.toString());
        return interaction.editReply({ content: successMessage });
    }

    // ===========================================================================
    // == LÓGICA DE APROBACIÓN DE EQUIPOS VÍA SELECT MENU (LIGAS GOLD/SILVER/BRONZE) ==
    // ===========================================================================
    if (customId.startsWith('approve_team_select_')) {
        await interaction.deferUpdate();
        const esAprobador = member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!esAprobador) return interaction.followUp({ content: 'No tienes permisos para esta acción.', flags: MessageFlags.Ephemeral });

        const parts = customId.split('_');
        const applicantId = parts[3];
        const selectedValue = values[0];
        const [eloStr, leagueName] = selectedValue.split('_');
        const startingElo = parseInt(eloStr, 10) || 1000;

        const originalEmbed = interaction.message.embeds[0];
        if (!originalEmbed) return interaction.followUp({ content: 'Error: No se pudo encontrar el embed de la solicitud original.', flags: MessageFlags.Ephemeral });

        const teamNameField = originalEmbed.fields.find(f => f.name === 'Nombre del Equipo');
        const teamAbbrField = originalEmbed.fields.find(f => f.name === 'Abreviatura');
        const teamTwitterField = originalEmbed.fields.find(f => f.name === 'Twitter del Equipo');
        
        if (!teamNameField || !teamAbbrField) return interaction.followUp({ content: 'Error: El embed de datos está incompleto.', flags: MessageFlags.Ephemeral });

        const teamName = teamNameField.value;
        const teamAbbr = teamAbbrField.value;
        const teamTwitter = teamTwitterField ? teamTwitterField.value : 'No especificado';
        
        const logoUrl = originalEmbed.thumbnail ? originalEmbed.thumbnail.url : 'https://i.imgur.com/V4J2Fcf.png';

        const applicantMember = await guild.members.fetch(applicantId).catch(() => null);
        if (!applicantMember) return interaction.followUp({ content: `El usuario solicitante ya no está en el servidor.`, flags: MessageFlags.Ephemeral });

        const existingTeam = await Team.findOne({ $or: [{ name: teamName }, { managerId: applicantId }], guildId: guild.id });
        if (existingTeam) return interaction.followUp({ content: `Error: Ya existe un equipo con el nombre "${teamName}" o el usuario ya es mánager.`, flags: MessageFlags.Ephemeral });

        const newTeam = new Team({
            name: teamName,
            abbreviation: teamAbbr,
            guildId: guild.id,
            league: leagueName,
            logoUrl: logoUrl,
            twitterHandle: teamTwitter === 'No especificado' ? null : teamTwitter,
            managerId: applicantId,
            elo: startingElo
        });
        await newTeam.save();

        await applicantMember.roles.add(process.env.MANAGER_ROLE_ID).catch(() => {});
        await applicantMember.roles.add(process.env.PLAYER_ROLE_ID).catch(() => {});
        await applicantMember.setNickname(`|MG| ${teamAbbr} ${applicantMember.user.username}`).catch(err => console.log(`No se pudo cambiar apodo: ${err.message}`));

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        let componentsToUpdate = [disabledRow];
        // si hay un boton de rechazar y lo queremos deshabilitar tb, pero como le damos a replace, solo deshabilito el select menu
        
        const updatedEmbed = EmbedBuilder.from(originalEmbed);
        updatedEmbed.addFields({ name: 'Liga Asignada', value: `${leagueName} (ELO: ${startingElo})` });
        updatedEmbed.setColor('Green');
        
        await interaction.message.edit({ components: componentsToUpdate, embeds: [updatedEmbed] });

        try {
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

        return interaction.followUp({ content: `✅ Equipo **${teamName}** creado en Liga **${leagueName}**. ELO Inicial: **${startingElo}**.`, flags: MessageFlags.Ephemeral });
    }
};
