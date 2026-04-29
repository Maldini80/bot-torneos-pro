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

        const [eaClubId, eaPlatform, ...nameParts] = values[0].split('|');
        const eaClubName = nameParts.join('|') || 'Desconocido';

        const existingEaLink = await Team.findOne({ eaClubId: eaClubId, _id: { $ne: team._id } });
        if (existingEaLink) {
            return interaction.followUp({ content: `❌ Este club de EA ya está vinculado al equipo VPG "**${existingEaLink.name}**".`, flags: MessageFlags.Ephemeral });
        }

        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.member.roles.cache.has(process.env.REFEREE_ROLE_ID);

        if (isAdmin) {
            team.eaClubId = eaClubId;
            team.eaClubName = eaClubName;
            team.eaPlatform = eaPlatform;
            await team.save();
            
            return interaction.followUp({ 
                content: `✅ **¡Vinculación completada automáticamente!**\n\nEl equipo **${team.name}** se ha vinculado al club de EA **${eaClubName}** (ID: \`${eaClubId}\`) exitosamente por privilegios de administración.`,
                flags: MessageFlags.Ephemeral
            });
        }

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
                { name: '⚽ Club EA', value: `${eaClubName} (ID: ${eaClubId})`, inline: false },
                { name: '🖥️ Plataforma EA', value: `${eaPlatform}`, inline: true }
            )
            .setTimestamp();

        const safeClubName = eaClubName.substring(0, 30);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve_ealink_${teamId}_${eaClubId}_${eaPlatform}_${safeClubName}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
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
            const clubNameStr = team.eaClubName ? `\nNombre: \`${team.eaClubName}\`` : '';
            embed.addFields({ name: '🎮 Club de EA Vinculado', value: `ID: \`${team.eaClubId}\`${clubNameStr}\nConsola: \`${team.eaPlatform}\``, inline: false });
        } else {
            embed.addFields({ name: '🎮 Club de EA Vinculado', value: `❌ Sin vincular`, inline: false });
        }
            
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_change_data_${teamId}`).setLabel('Cambiar Datos').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`admin_change_manager_${teamId}`).setLabel('Cambiar Mánager').setStyle(ButtonStyle.Primary).setEmoji('👑'),
            new ButtonBuilder().setCustomId(`admin_edit_elo_${teamId}`).setLabel('Editar ELO').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
            new ButtonBuilder().setCustomId(`admin_elo_history_${teamId}`).setLabel('Historial ELO').setStyle(ButtonStyle.Secondary).setEmoji('📜')
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_scout_player_${teamId}`).setLabel('Scout Jugador').setStyle(ButtonStyle.Success).setEmoji('🔍'),
            new ButtonBuilder().setCustomId(`admin_dissolve_team_${teamId}`).setLabel('DISOLVER EQUIPO').setStyle(ButtonStyle.Danger)
        );
        
        if (team.eaClubId) {
            row2.addComponents(new ButtonBuilder().setCustomId(`admin_unlink_ea_${teamId}`).setLabel('Desvincular EA').setStyle(ButtonStyle.Danger).setEmoji('❌'));
        } else {
            row2.addComponents(new ButtonBuilder().setCustomId(`admin_link_ea_${teamId}`).setLabel('Vincular EA').setStyle(ButtonStyle.Success).setEmoji('🎮'));
        }

        const allRows = [row1, row2];

        if (team.eaClubId) {
            const row3 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_ea_matches_${teamId}`).setLabel('Últimos Partidos EA').setStyle(ButtonStyle.Primary).setEmoji('📊'),
                new ButtonBuilder().setCustomId(`admin_ea_heights_${teamId}`).setLabel('Ver Alturas').setStyle(ButtonStyle.Primary).setEmoji('📏'),
                new ButtonBuilder().setCustomId(`admin_undo_scan_${teamId}`).setLabel('Deshacer Escaneos (24h)').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
            );
            allRows.push(row3);
        }

        allRows.push(new ActionRowBuilder().addComponents(leagueMenu));

        await interaction.editReply({ content: '', embeds: [embed], components: allRows });
        return;
    }

    if (customId === 'admin_crawler_days_select') {
        await interaction.deferUpdate();
        const selectedDays = values.map(Number); // Convertir a números
        
        const { getDb: getDbImport } = await import('../../../database.js');
        const settingsColl = getDbImport().collection('bot_settings');
        await settingsColl.updateOne({ _id: 'global_config' }, { $set: { crawlerDays: selectedDays } });
        
        const dayNames = { 0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' };
        const selectedNames = selectedDays.map(d => dayNames[d]).join(', ');

        return interaction.editReply({ 
            content: `✅ Días de escaneo del Crawler actualizados correctamente.\n**Nuevos días:** ${selectedNames}`,
            components: [] 
        });
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
                    { name: t('managerGuideStep3Title', applicantMember), value: t('managerGuideStep3Value', applicantMember) },
                    { name: 'Paso 4: Vincular Equipo a EA', value: 'Vete a tu canal de gestión de equipo en el servidor y pulsa el botón **Vincular EA**. Esto es **obligatorio** para poder inscribirte en torneos y que el escáner registre las estadísticas de tus partidos.' }
                );
            await applicantMember.send({ embeds: [managerGuideEmbed] });
        } catch (dmError) {
            console.log(`AVISO: No se pudo enviar el MD de guía al nuevo mánager ${applicantMember.user.tag}.`);
        }

        return interaction.followUp({ content: `✅ Equipo **${teamName}** creado en Liga **${leagueName}**. ELO Inicial: **${startingElo}**.`, flags: MessageFlags.Ephemeral });
    }

    // --- Stats: Selector de franjas horarias → abrir modal ---
    if (customId.startsWith('stats_slot_select_')) {
        const statsType = customId.replace('stats_slot_select_', ''); // stats_player_scout | stats_team_scout | stats_match_history
        const selectedSlots = values; // Array of slot names or ['__ALL__']
        
        console.log(`📊 [STATS] ${interaction.user.tag} (${interaction.user.id}) seleccionó franjas: [${selectedSlots.join(', ')}] para ${statsType}`);
        
        // Guardar selección en memoria
        const { pendingSelections } = await import('../../utils/pendingStatsSelections.js');
        pendingSelections.set(interaction.user.id, {
            slots: selectedSlots,
            timestamp: Date.now()
        });
        
        // Abrir modal según el tipo de stats
        const typeMap = {
            'stats_player_scout': { modalId: 'stats_player_scout_modal', title: '🔍 Scout de Jugador', fieldId: 'player_name', fieldLabel: 'Nombre del jugador (parcial o completo)', placeholder: 'Ej: Messi, xavi_pro, etc.' },
            'stats_team_scout': { modalId: 'stats_team_scout_modal', title: '🛡️ Análisis de Equipo', fieldId: 'team_name', fieldLabel: 'Nombre del equipo (parcial)', placeholder: 'Ej: Real Madrid, Barça, etc.' },
            'stats_match_history': { modalId: 'stats_match_history_modal', title: '📜 Historial de Partidos', fieldId: 'team_name', fieldLabel: 'Nombre del equipo (parcial)', placeholder: 'Ej: Real Madrid, Barça, etc.' }
        };
        
        const cfg = typeMap[statsType];
        if (!cfg) return interaction.reply({ content: '❌ Tipo de stats no reconocido.', ephemeral: true });
        
        const modal = new ModalBuilder().setCustomId(cfg.modalId).setTitle(cfg.title);
        const input = new TextInputBuilder()
            .setCustomId(cfg.fieldId)
            .setLabel(cfg.fieldLabel)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(cfg.placeholder)
            .setRequired(true);
        
        // Calcular fecha por defecto: ayer-hoy (Madrid)
        const _fmtD = (d) => d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit' });
        const _now = new Date();
        const _yesterday = new Date(_now.getTime() - 86400000);
        const defaultDateRange = `${_fmtD(_yesterday)}-${_fmtD(_now)}`;
        
        const dateInput = new TextInputBuilder()
            .setCustomId('date_filter')
            .setLabel('📅 Rango de fechas (opcional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: 15/04/26-28/04/26 o desde 20/04/26')
            .setValue(defaultDateRange)
            .setRequired(false)
            .setMaxLength(30);
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(input),
            new ActionRowBuilder().addComponents(dateInput)
        );
        
        return interaction.showModal(modal);
    }

    // --- Admin: Editar franja horaria (select → modal pre-rellenado) ---
    if (customId === 'admin_edit_slot_select') {
        const slotName = values[0];
        
        const { getDb: getDbSlots } = await import('../../../database.js');
        const config = await getDbSlots().collection('bot_settings').findOne({ _id: 'global_config' });
        const slot = (config?.timeSlots || []).find(s => s.name === slotName);
        
        if (!slot) return interaction.reply({ content: `❌ No se encontró la franja **"${slotName}"**.`, ephemeral: true });
        
        const modal = new ModalBuilder()
            .setCustomId('admin_edit_time_slot_modal')
            .setTitle('✏️ Editar Franja Horaria');

        const nameInput = new TextInputBuilder()
            .setCustomId('slot_name')
            .setLabel('Nombre de la franja')
            .setStyle(TextInputStyle.Short)
            .setValue(slot.name)
            .setRequired(true)
            .setMaxLength(30);

        const startInput = new TextInputBuilder()
            .setCustomId('slot_start')
            .setLabel('Hora de inicio (HH:MM)')
            .setStyle(TextInputStyle.Short)
            .setValue(slot.start)
            .setRequired(true)
            .setMaxLength(5);

        const endInput = new TextInputBuilder()
            .setCustomId('slot_end')
            .setLabel('Hora de fin (HH:MM)')
            .setStyle(TextInputStyle.Short)
            .setValue(slot.end)
            .setRequired(true)
            .setMaxLength(5);

        const daysInput = new TextInputBuilder()
            .setCustomId('slot_days')
            .setLabel('Días (opcional: 0=Dom,1=Lun,...,6=Sáb)')
            .setStyle(TextInputStyle.Short)
            .setValue(slot.daysRaw || '')
            .setPlaceholder('Ej: 0,1,2,3,4 — Vacío = todos')
            .setRequired(false)
            .setMaxLength(20);

        // Guardar nombre original para saber cuál actualizar
        const { pendingSelections } = await import('../../utils/pendingStatsSelections.js');
        pendingSelections.set(interaction.user.id, {
            editSlotOriginalName: slot.name,
            timestamp: Date.now()
        });

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(startInput),
            new ActionRowBuilder().addComponents(endInput),
            new ActionRowBuilder().addComponents(daysInput)
        );

        return interaction.showModal(modal);
    }

    // --- Stats: Desambiguación de equipo/jugador (select → ejecutar stats) ---
    if (customId.startsWith('stats_disambig_')) {
        const selectedValue = values[0]; // eaClubId o eaPlayerName
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const { pendingSelections } = await import('../../utils/pendingStatsSelections.js');
        const ctx = pendingSelections.get(interaction.user.id);
        if (ctx) pendingSelections.delete(interaction.user.id);
        
        if (!ctx || !ctx.disambigType) {
            return interaction.editReply({ content: '❌ La sesión expiró. Vuelve a usar el botón del panel.' });
        }

        const { getDb } = await import('../../../database.js');
        const db = getDb();
        if (!db) return interaction.editReply({ content: 'Error de base de datos.' });
        
        const { extractMatchInfo, mergeSessions } = await import('../../utils/matchUtils.js');

        // ── TEAM SCOUT ──
        if (ctx.disambigType === 'team_scout') {
            const club = await db.collection('club_profiles').findOne({ eaClubId: selectedValue });
            if (!club) return interaction.editReply({ content: '❌ Equipo no encontrado en la base de datos.' });
            
            const vpgTeam = await Team.findOne({ eaClubId: selectedValue }).lean();
            const vpgTeamName = vpgTeam?.name || null;
            const vpgLogo = vpgTeam?.logoUrl || null;
            
            // Reconstruir filtros desde contexto
            const timeFilters = ctx.timeFilters || [];
            const daysFilter = ctx.daysFilter || null;
            const dateFilter = ctx.dateFilter || null;
            const resolvedSlotNames = ctx.resolvedSlotNames || [];
            const hasFilters = timeFilters.length > 0 || daysFilter || dateFilter;
            
            let filterText = '';
            if (resolvedSlotNames.length > 0) filterText += `📐 ${resolvedSlotNames.join(', ')}`;
            else if (timeFilters.length > 0) filterText += `⏰ ${timeFilters.map(tf => `${tf.start}-${tf.end}`).join(' + ')}`;
            if (daysFilter) {
                const dayNames = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
                filterText += (filterText ? ' | ' : '') + `📅 ${daysFilter.map(d => dayNames[d]).join(', ')}`;
            }
            if (dateFilter) {
                const fmt = (d) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
                let dateStr = '';
                if (dateFilter.from && dateFilter.to) dateStr = `${fmt(dateFilter.from)} — ${fmt(dateFilter.to)}`;
                else if (dateFilter.from) dateStr = `desde ${fmt(dateFilter.from)}`;
                else if (dateFilter.to) dateStr = `hasta ${fmt(dateFilter.to)}`;
                filterText += (filterText ? ' | ' : '') + `🗓️ ${dateStr}`;
            }
            
            let s, m;
            if (hasFilters) {
                const allMatches = await db.collection('scanned_matches').find({
                    [`clubs.${club.eaClubId}`]: { $exists: true }
                }).sort({ timestamp: -1 }).limit(200).toArray();
                
                const filtered = allMatches.filter(match => {
                    if (!match.timestamp) return false;
                    const matchDate = new Date(parseInt(match.timestamp) * 1000);
                    if (dateFilter) {
                        if (dateFilter.from && matchDate < new Date(dateFilter.from)) return false;
                        if (dateFilter.to && matchDate > new Date(dateFilter.to)) return false;
                    }
                    if (daysFilter) {
                        const madridDayStr = matchDate.toLocaleDateString('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' });
                        const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
                        if (!daysFilter.includes(dayMap[madridDayStr] ?? matchDate.getDay())) return false;
                    }
                    if (timeFilters.length > 0) {
                        const madridTimeStr = matchDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
                        const [h, min] = madridTimeStr.split(':').map(Number);
                        const matchMin = h * 60 + min;
                        const ok = timeFilters.some(tf => {
                            const [sh, sm] = tf.start.split(':').map(Number);
                            const [eh, em] = tf.end.split(':').map(Number);
                            const sM = sh * 60 + sm, eM = eh * 60 + em;
                            return sM <= eM ? (matchMin >= sM && matchMin <= eM) : (matchMin >= sM || matchMin <= eM);
                        });
                        if (!ok) return false;
                    }
                    return true;
                });
                
                const getVal = (obj, ...keys) => { for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; } return 0; };
                const aggr = { matchesPlayed: 0, wins: 0, ties: 0, losses: 0, goals: 0, goalsAgainst: 0, shots: 0, passesMade: 0, passesAttempted: 0, tacklesMade: 0, tacklesAttempted: 0 };
                const mergedMatches = mergeSessions(filtered, club.eaClubId);
                for (const mData of mergedMatches) {
                    aggr.matchesPlayed++;
                    aggr.goals += mData.ourGoals;
                    aggr.goalsAgainst += mData.oppGoals;
                    if (mData.ourGoals > mData.oppGoals) aggr.wins++;
                    else if (mData.ourGoals < mData.oppGoals) aggr.losses++;
                    else aggr.ties++;
                    for (const session of mData.sessions) {
                        if (session.match.players?.[club.eaClubId]) {
                            for (const p of Object.values(session.match.players[club.eaClubId])) {
                                aggr.shots += getVal(p, 'shots');
                                aggr.passesMade += getVal(p, 'passesMade', 'passesmade', 'passescompleted');
                                aggr.passesAttempted += getVal(p, 'passesAttempted', 'passesattempted', 'passattempts');
                                aggr.tacklesMade += getVal(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                                aggr.tacklesAttempted += getVal(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                            }
                        }
                    }
                }
                s = aggr; m = aggr.matchesPlayed;
            } else {
                s = club.stats || {}; m = s.matchesPlayed || 0;
            }

            if (m === 0) return interaction.editReply({ content: `El equipo **${club.eaClubName}** no tiene partidos registrados.` });

            const wins = s.wins || 0, ties = s.ties || 0, losses = s.losses || 0;
            const goals = s.goals || 0, goalsAgainst = s.goalsAgainst || 0;
            const passAcc = (s.passesAttempted || 0) > 0 ? (((s.passesMade || 0) / s.passesAttempted) * 100).toFixed(1) : '—';
            const tackleAcc = (s.tacklesAttempted || 0) > 0 ? (((s.tacklesMade || 0) / s.tacklesAttempted) * 100).toFixed(1) : '—';
            const winrate = ((wins / m) * 100).toFixed(1);
            const gpg = (goals / m).toFixed(2), gapg = (goalsAgainst / m).toFixed(2);

            const embed = new EmbedBuilder()
                .setTitle(`🛡️ ${vpgTeamName || club.eaClubName}`)
                .setDescription(`📊 Análisis basado en **${m}** partidos.${filterText ? `\n🔎 **Filtro:** ${filterText}` : ''}`)
                .setColor('#3498db')
                .addFields(
                    { name: '🏆 Victorias', value: `${wins}`, inline: true },
                    { name: '🤝 Empates', value: `${ties}`, inline: true },
                    { name: '❌ Derrotas', value: `${losses}`, inline: true },
                    { name: '📈 Winrate', value: `${winrate}%`, inline: true },
                    { name: '⚽ Goles F/C', value: `${goals}/${goalsAgainst}`, inline: true },
                    { name: '⚽ Media G', value: `${gpg} F / ${gapg} C`, inline: true },
                    { name: 'Eficacia Pases', value: `${passAcc}%`, inline: true },
                    { name: 'Eficacia Entradas', value: `${tackleAcc}%`, inline: true },
                    { name: 'Diferencia Goles', value: `${goals > goalsAgainst ? '+' : ''}${goals - goalsAgainst}`, inline: true }
                );
            if (vpgLogo) embed.setThumbnail(vpgLogo);
            if (filterText) embed.setFooter({ text: `Filtro aplicado: ${filterText}` });
            return interaction.editReply({ embeds: [embed] });
        }

        // ── MATCH HISTORY ──
        if (ctx.disambigType === 'match_history') {
            const club = await db.collection('club_profiles').findOne({ eaClubId: selectedValue });
            if (!club) return interaction.editReply({ content: '❌ Equipo no encontrado.' });
            
            const timeFilters = ctx.timeFilters || [];
            const daysFilter = ctx.daysFilter || null;
            const dateFilter = ctx.dateFilter || null;
            
            let matches = await db.collection('scanned_matches').find({
                [`clubs.${club.eaClubId}`]: { $exists: true }
            }).sort({ timestamp: -1 }).limit(50).toArray();

            matches = matches.filter(match => {
                if (!match.timestamp) return false;
                const matchDate = new Date(parseInt(match.timestamp) * 1000);
                if (dateFilter) {
                    if (dateFilter.from && matchDate < new Date(dateFilter.from)) return false;
                    if (dateFilter.to && matchDate > new Date(dateFilter.to)) return false;
                }
                if (daysFilter) {
                    const madridDayStr = matchDate.toLocaleDateString('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' });
                    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
                    if (!daysFilter.includes(dayMap[madridDayStr] ?? matchDate.getDay())) return false;
                }
                if (timeFilters.length > 0) {
                    const madridTimeStr = matchDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
                    const [h, min] = madridTimeStr.split(':').map(Number);
                    const matchMin = h * 60 + min;
                    const ok = timeFilters.some(tf => {
                        const [sh, sm] = tf.start.split(':').map(Number);
                        const [eh, em] = tf.end.split(':').map(Number);
                        const sM = sh * 60 + sm, eM = eh * 60 + em;
                        return sM <= eM ? (matchMin >= sM && matchMin <= eM) : (matchMin >= sM || matchMin <= eM);
                    });
                    if (!ok) return false;
                }
                return true;
            });

            const mergedMatches = mergeSessions(matches, club.eaClubId);
            if (mergedMatches.length === 0) return interaction.editReply({ content: `No se encontraron partidos para **${club.eaClubName}**.` });

            const POS_MAP = {
                0: 'POR', 1: 'LD', 2: 'DFC', 3: 'LI', 4: 'CAD', 5: 'CAI',
                6: 'MCD', 7: 'MC', 8: 'MCO', 9: 'MD', 10: 'MI',
                11: 'ED', 12: 'MI', 13: 'MP', 14: 'DC',
                'goalkeeper': 'POR', 'defender': 'DFC', 'centerback': 'DFC',
                'fullback': 'LD', 'leftback': 'LI', 'rightback': 'LD',
                'midfielder': 'MC', 'defensivemidfield': 'MCD', 'centralmidfield': 'MC',
                'attackingmidfield': 'MCO', 'forward': 'DC', 'attacker': 'DC',
                'striker': 'DC', 'winger': 'ED', 'wing': 'ED'
            };
            const POS_ORDER = { 'POR': 0, 'DFC': 1, 'LD': 2, 'LI': 3, 'CAD': 4, 'CAI': 5, 'MCD': 6, 'MC': 7, 'CARR': 8, 'MCO': 9, 'MD': 10, 'MI': 10, 'ED': 11, 'EI': 12, 'MP': 13, 'DC': 14 };
            const gv = (obj, ...keys) => { for (const k of keys) { if (obj[k] !== undefined) return parseInt(obj[k]) || 0; } return 0; };
            const resolvePos = (pos, archId) => {
                if (pos !== undefined && POS_MAP[pos] !== undefined) return POS_MAP[pos];
                if (archId !== undefined) {
                    const a = String(archId).toLowerCase();
                    if (POS_MAP[a]) return POS_MAP[a];
                    if (a.includes('goal') || a.includes('keeper')) return 'POR';
                    if (a.includes('defend') || a.includes('back')) return 'DFC';
                    if (a.includes('midfield')) return 'MC';
                    if (a.includes('wing')) return 'ED';
                    if (a.includes('forward') || a.includes('strik') || a.includes('attack')) return 'DC';
                }
                return 'CARR';
            };

            const entries = [];
            for (const mData of mergedMatches) {
                if (mData.isMerged) {
                    let sessionLines = '';
                    for (let si = 0; si < mData.sessions.length; si++) {
                        const s = mData.sessions[si];
                        const prefix = si < mData.sessions.length - 1 ? '├' : '└';
                        let dnfTag = '';
                        if (s.isDnf) dnfTag = ` 🔌 Min ${Math.floor(s.maxSecs / 60)}`;
                        sessionLines += `\n${prefix} Sesión ${si + 1}: ${s.ourGoals} - ${s.oppGoals}${dnfTag}`;
                    }
                    let resultEmoji = '➖', resultColor = '#95a5a6';
                    if (mData.ourGoals > mData.oppGoals) { resultEmoji = '✅'; resultColor = '#2ecc71'; }
                    else if (mData.ourGoals < mData.oppGoals) { resultEmoji = '❌'; resultColor = '#e74c3c'; }
                    const mdo = new Date(mData.timestamp * 1000);
                    const embed = new EmbedBuilder()
                        .setTitle(`${resultEmoji} ${club.eaClubName} ${mData.ourGoals} - ${mData.oppGoals} ${mData.oppName}`)
                        .setDescription(`📅 ${mdo.toLocaleDateString('es-ES')} — 🕐 ${mdo.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}h (Madrid)\n🔗 **${mData.sessionCount} sesiones** (fusión DNF)${sessionLines}`)
                        .setColor(resultColor);
                    entries.push(embed);
                } else {
                    const g = mData.sessions[0];
                    const match = g.match;
                    const mdo = new Date(g.timestamp * 1000);
                    const matchDate = mdo.toLocaleDateString('es-ES');
                    const matchTime = mdo.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
                    let resultEmoji = '➖', resultColor = '#95a5a6';
                    if (g.ourGoals > g.oppGoals) { resultEmoji = '✅'; resultColor = '#2ecc71'; }
                    else if (g.ourGoals < g.oppGoals) { resultEmoji = '❌'; resultColor = '#e74c3c'; }

                    const sumTeamStats = (players) => {
                        let s = { shots: 0, pm: 0, pa: 0, tm: 0, ta: 0, gkSaves: 0 };
                        if (!players) return s;
                        for (const pid in players) {
                            const p = players[pid];
                            s.shots += gv(p, 'shots');
                            s.pm += gv(p, 'passesMade', 'passesmade', 'passescompleted');
                            s.pa += gv(p, 'passesAttempted', 'passesattempted', 'passattempts');
                            s.tm += gv(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                            s.ta += gv(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                            s.gkSaves += gv(p, 'saves');
                        }
                        return s;
                    };
                    const ourStats = sumTeamStats(match.players?.[club.eaClubId]);
                    const oppStats = sumTeamStats(match.players?.[g.opponentId]);
                    const ourShotsOT = g.ourGoals + oppStats.gkSaves;
                    const oppShotsOT = g.oppGoals + ourStats.gkSaves;
                    const mPassMade = ourStats.pm, mPassAtt = ourStats.pa;
                    const mPassAcc = mPassAtt > 0 ? ((mPassMade / mPassAtt) * 100).toFixed(0) : '?';
                    const mTackMade = ourStats.tm, mTackAtt = ourStats.ta;
                    const mTackAcc = mTackAtt > 0 ? ((mTackMade / mTackAtt) * 100).toFixed(0) : '?';
                    const totalPassAtt = mPassAtt + oppStats.pa;
                    const estPoss = totalPassAtt > 0 ? ((mPassAtt / totalPassAtt) * 100).toFixed(0) : '?';
                    const estOppPoss = totalPassAtt > 0 ? ((oppStats.pa / totalPassAtt) * 100).toFixed(0) : '?';
                    const oppPassAcc = oppStats.pa > 0 ? ((oppStats.pm / oppStats.pa) * 100).toFixed(0) : '?';
                    const dnfText = g.isDnf ? ` *(🔌 DNF min ${Math.floor(g.maxSecs / 60)})*` : '';

                    let lineupStr = '';
                    if (match.players && match.players[club.eaClubId]) {
                        const sorted = Object.values(match.players[club.eaClubId]).map(p => {
                            const pos = resolvePos(p.pos, p.archetypeid);
                            const rating = parseFloat(p.rating || 0).toFixed(1);
                            let extras = [];
                            if (parseInt(p.goals || 0) > 0) extras.push(`⚽${p.goals}`);
                            if (parseInt(p.assists || 0) > 0) extras.push(`🎩${p.assists}`);
                            const pPA = gv(p, 'passesAttempted', 'passesattempted', 'passattempts');
                            const pPM = gv(p, 'passesMade', 'passesmade', 'passescompleted');
                            if (pPA > 0) extras.push(`👟${((pPM / pPA) * 100).toFixed(0)}%`);
                            const pTA = gv(p, 'tacklesAttempted', 'tacklesattempted', 'tackleattempts');
                            const pTM = gv(p, 'tacklesMade', 'tacklesmade', 'tacklescompleted');
                            if (pTA > 0) extras.push(`🛡️${((pTM / pTA) * 100).toFixed(0)}%`);
                            return { order: POS_ORDER[pos] ?? 99, text: `\`${pos.padEnd(3)}\` **${p.playername}** ⭐${rating}${extras.length > 0 ? ' ' + extras.join(' ') : ''}` };
                        }).sort((a, b) => a.order - b.order);
                        lineupStr = sorted.map(p => p.text).join('\n');
                    }

                    const embed = new EmbedBuilder()
                        .setTitle(`${resultEmoji} ${club.eaClubName} ${g.ourGoals} - ${g.oppGoals} ${g.oppName}`)
                        .setDescription(`📅 ${matchDate} — 🕐 ${matchTime}h (Madrid)${dnfText}`)
                        .setColor(resultColor);

                    if (g.isDnf) {
                        embed.addFields(
                            { name: '⚽ Posesión (est.)', value: `⚠️ *No disp. (DNF)*`, inline: true },
                            { name: '🔫 Tiros', value: `**${ourStats.shots}** (${ourShotsOT} a puerta)`, inline: true },
                            { name: '🎯 Eficacia', value: ourStats.shots > 0 ? `**${((ourShotsOT / ourStats.shots) * 100).toFixed(0)}%**` : '—', inline: true },
                            { name: '👟 Pases', value: `**${mPassMade}/${mPassAtt}** (${mPassAcc}%)`, inline: true },
                            { name: '🛡️ Entradas', value: `**${mTackMade}/${mTackAtt}** (${mTackAcc}%)`, inline: true },
                            { name: '⚠️ DNF', value: `*Stats del rival no disp.*`, inline: true }
                        );
                    } else {
                        embed.addFields(
                            { name: '⚽ Posesión (est.)', value: `**${estPoss}%** vs ${estOppPoss}%`, inline: true },
                            { name: '🔫 Tiros', value: `**${ourStats.shots}** (${ourShotsOT} a puerta) vs ${oppStats.shots} (${oppShotsOT})`, inline: true },
                            { name: '🎯 Eficacia', value: ourStats.shots > 0 ? `**${((ourShotsOT / ourStats.shots) * 100).toFixed(0)}%**` : '—', inline: true },
                            { name: '👟 Pases', value: `**${mPassMade}/${mPassAtt}** (${mPassAcc}%) vs ${oppPassAcc}%`, inline: true },
                            { name: '🛡️ Entradas', value: `**${mTackMade}/${mTackAtt}** (${mTackAcc}%)`, inline: true },
                            { name: '\u200B', value: '\u200B', inline: true }
                        );
                    }
                    if (lineupStr) embed.addFields({ name: '📋 Alineación y Rendimiento', value: lineupStr, inline: false });
                    entries.push(embed);
                }
            }

            const embeds = entries.slice(0, 5);
            let filterStr = '';
            if (ctx.resolvedSlotNames?.length > 0) filterStr = ` (📐 ${ctx.resolvedSlotNames.join(', ')})`;
            return interaction.editReply({ content: `📜 **Últimos ${embeds.length} partidos de ${club.eaClubName}**${filterStr}:`, embeds });
        }

        // ── PLAYER SCOUT ──
        if (ctx.disambigType === 'player_scout') {
            const profile = await db.collection('player_profiles').findOne({ eaPlayerName: selectedValue });
            if (!profile) return interaction.editReply({ content: '❌ Jugador no encontrado.' });
            
            const timeFilters = ctx.timeFilters || [];
            const daysFilter = ctx.daysFilter || null;
            const dateFilter = ctx.dateFilter || null;
            const resolvedSlotNames = ctx.resolvedSlotNames || [];
            const hasFilters = timeFilters.length > 0 || daysFilter || dateFilter;

            let filterText = '';
            if (resolvedSlotNames.length > 0) filterText += `📐 ${resolvedSlotNames.join(', ')}`;
            else if (timeFilters.length > 0) filterText += `⏰ ${timeFilters.map(tf => `${tf.start}-${tf.end}`).join(' + ')}`;
            if (daysFilter) {
                const dayNames = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
                filterText += (filterText ? ' | ' : '') + `📅 ${daysFilter.map(d => dayNames[d]).join(', ')}`;
            }
            if (dateFilter) {
                const fmt = (d) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
                let dateStr = '';
                if (dateFilter.from && dateFilter.to) dateStr = `${fmt(dateFilter.from)} — ${fmt(dateFilter.to)}`;
                else if (dateFilter.from) dateStr = `desde ${fmt(dateFilter.from)}`;
                else if (dateFilter.to) dateStr = `hasta ${fmt(dateFilter.to)}`;
                filterText += (filterText ? ' | ' : '') + `🗓️ ${dateStr}`;
            }

            const s = profile.stats || {};
            const m = s.matchesPlayed || 0;
            if (m === 0) return interaction.editReply({ content: `El jugador **${profile.eaPlayerName}** no tiene partidos registrados.` });

            const pos = profile.lastPosition || '?';
            const goals = s.goals || 0, assists = s.assists || 0, shots = s.shots || 0;
            const passesMade = s.passesMade || 0, passesAtt = s.passesAttempted || 0;
            const tacklesMade = s.tacklesMade || 0, tacklesAtt = s.tacklesAttempted || 0;
            const mom = s.mom || 0;
            const passAcc = passesAtt > 0 ? ((passesMade / passesAtt) * 100).toFixed(1) : '—';
            const tackleAcc = tacklesAtt > 0 ? ((tacklesMade / tacklesAtt) * 100).toFixed(1) : '—';
            const gpg = (goals / m).toFixed(2), apg = (assists / m).toFixed(2);
            let avgRating = '—';
            if (s.ratings && s.ratings.length > 0) avgRating = (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1);

            const embed = new EmbedBuilder()
                .setTitle(`🔍 Informe de Scout: ${profile.eaPlayerName}`)
                .setDescription(`📋 **Equipo:** ${profile.lastClub || '?'}\n🎽 **Posición:** ${pos}${filterText ? `\n🔎 **Filtro:** ${filterText}` : ''}`)
                .setColor('#2ecc71')
                .addFields(
                    { name: '🏟️ Partidos', value: `**${m}**`, inline: true },
                    { name: '⭐ Nota Media', value: `**${avgRating}**`, inline: true },
                    { name: '🏆 MVP', value: `**${mom}**`, inline: true },
                    { name: 'Goles', value: `${goals} (${gpg}/P)`, inline: true },
                    { name: 'Asistencias', value: `${assists} (${apg}/P)`, inline: true },
                    { name: 'Eficacia Pases', value: `${passAcc}%`, inline: true },
                    { name: 'Eficacia Entradas', value: `${tackleAcc}%`, inline: true }
                );
            if (filterText) embed.setFooter({ text: `Filtro aplicado: ${filterText}` });
            return interaction.editReply({ embeds: [embed] });
        }

        return interaction.editReply({ content: '❌ Tipo de desambiguación no reconocido.' });
    }
};
