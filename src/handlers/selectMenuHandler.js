// --- INICIO DEL ARCHIVO selectMenuHandler.js (VERSIÓN FINAL Y COMPLETA) ---

import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, DRAFT_POSITIONS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { updateTournamentConfig, addCoCaptain, createNewDraft, handlePlayerSelection, createTournamentFromDraft, kickPlayerFromDraft, inviteReplacementPlayer, approveTeam, updateDraftMainInterface, updatePublicMessages, notifyVisualizer } from '../logic/tournamentLogic.js';
import { handlePlatformSelection, handlePCLauncherSelection, handleProfileUpdateSelection } from '../logic/verificationLogic.js';
import { setChannelIcon } from '../utils/panelManager.js';
import { createTeamRosterManagementEmbed, createPlayerManagementEmbed } from '../utils/embeds.js';

export async function handleSelectMenu(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    
    const [action, ...params] = customId.split(':');

    // =======================================================
    // --- LÓGICA DE VERIFICACIÓN Y GESTIÓN DE PERFIL ---
    // =======================================================

    if (action === 'verify_select_platform') {
        await handlePlatformSelection(interaction);
        return;
    }

    if (action === 'verify_select_pc_launcher') {
        await handlePCLauncherSelection(interaction);
        return;
    }

    if (action === 'update_profile_select_field') {
        await handleProfileUpdateSelection(interaction);
        return;
    }

    // --- FIN DE LA NUEVA LÓGICA ---
    if (action === 'admin_select_replacement_position' || action === 'admin_select_replacement_page') {
        await interaction.deferUpdate();
        const [draftShortId, teamId, kickedPlayerId, position, pageStr] = params;
        const page = action === 'admin_select_replacement_page' ? parseInt(interaction.values[0].replace('page_', '')) : 0;
        const selectedPosition = action === 'admin_select_replacement_position' ? interaction.values[0] : position;

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const freeAgents = draft.players.filter(p => !p.captainId && !p.isCaptain);
        
        let candidates = freeAgents.filter(p => p.primaryPosition === selectedPosition);
        if (candidates.length === 0) {
            candidates = freeAgents.filter(p => p.secondaryPosition === selectedPosition);
        }

        if (candidates.length === 0) {
            return interaction.editReply({
                content: `No se encontraron agentes libres para la posición **${DRAFT_POSITIONS[selectedPosition]}**.`,
                components: []
            });
        }
        
        candidates.sort((a, b) => a.psnId.localeCompare(b.psnId));
        const pageSize = 25;
        const pageCount = Math.ceil(candidates.length / pageSize);
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        const candidatesPage = candidates.slice(startIndex, endIndex);

        const playerOptions = candidatesPage.map(p => ({
            label: p.psnId,
            description: `Pos: ${p.primaryPosition} / ${p.secondaryPosition || 'N/A'}`,
            value: p.userId
        }));

        const playerMenu = new StringSelectMenuBuilder()
            .setCustomId(`captain_invite_replacement_select:${draftShortId}:${teamId}:${kickedPlayerId}`)
            .setPlaceholder(`Pág. ${page + 1}/${pageCount} - Selecciona un jugador`)
            .addOptions(playerOptions);

        const components = [new ActionRowBuilder().addComponents(playerMenu)];

        if (pageCount > 1) {
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                pageOptions.push({
                    label: `Página ${i + 1} de ${pageCount}`,
                    value: `page_${i}`
                });
            }
            const pageMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_select_replacement_page:${draftShortId}:${teamId}:${kickedPlayerId}:${selectedPosition}`)
                .setPlaceholder('Cambiar de página')
                .addOptions(pageOptions);
            components.unshift(new ActionRowBuilder().addComponents(pageMenu));
        }
        
        await interaction.editReply({
            content: `Mostrando agentes libres para **${DRAFT_POSITIONS[selectedPosition]}**. Hay un total de ${candidates.length} jugadores.`,
            components
        });
        return;
    }
    // =======================================================
    // --- LÓGICA ORIGINAL DEL BOT ---
    // =======================================================

    if (action === 'admin_edit_team_select') {
    const [tournamentShortId] = params;
    const captainId = interaction.values[0]; // El ID del capitán del equipo seleccionado
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

    // --- INICIO DE LA LÓGICA AÑADIDA ---
    if (action === 'draft_pick_search_type') {
        await interaction.deferUpdate();
        const [draftShortId, captainId] = params;
        const searchType = interaction.values[0]; // 'primary' o 'secondary'

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const availablePlayers = draft.players.filter(p => !p.isCaptain && !p.captainId);
        
        const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({
            label: value,
            value: key,
        }));

        const positionMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_pick_by_position:${draftShortId}:${captainId}:${searchType}`) // Se podría usar el searchType aquí si la lógica cambiara
            .setPlaceholder(`Elige la POSICIÓN ${searchType === 'primary' ? 'PRIMARIA' : 'SECUNDARIA'} que buscas`)
            .addOptions(positionOptions);
        
        await interaction.editReply({
            content: `Búsqueda cambiada. Por favor, elige la posición que quieres cubrir.`,
            components: [new ActionRowBuilder().addComponents(positionMenu)]
        });
        return;
    }
    // --- FIN DE LA LÓGICA AÑADIDA ---

    if (action === 'admin_select_draft_to_manage_players') {
        await interaction.deferUpdate();
        const draftShortId = interaction.values[0];
        
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        if (!draft.captains || draft.captains.length === 0) {
            return interaction.editReply({
                content: `❌ El draft **${draft.name}** no tiene capitanes aprobados. No hay plantillas para gestionar.`,
                components: []
            });
        }

        const teamOptions = draft.captains.map(c => ({
            label: c.teamName,
            description: `Capitán: ${c.userName}`,
            value: c.userId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_team_to_manage:${draftShortId}`)
            .setPlaceholder('Selecciona un equipo para ver su plantilla')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: `Gestionando **${draft.name}**. Selecciona un equipo:`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_select_team_to_manage') {
        await interaction.deferUpdate();
        const [draftShortId] = params;
        const teamId = interaction.values[0];

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const team = draft.captains.find(c => c.userId === teamId);
        const teamPlayers = draft.players.filter(p => p.captainId === teamId);

        const rosterEmbed = createTeamRosterManagementEmbed(team, teamPlayers, draftShortId);
        await interaction.editReply(rosterEmbed);
        return;
    }

    if (action === 'admin_select_player_from_roster') {
    await interaction.deferUpdate();
    const [draftShortId, teamId] = params;
    const selectedPlayerId = interaction.values[0];

    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    const player = draft.players.find(p => p.userId === selectedPlayerId);
    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

    // Llamamos a la ficha en modo 'manage' para que muestre los botones de acción
    const playerManagementEmbed = await createPlayerManagementEmbed(player, draft, teamId, isAdmin, 'manage');
    await interaction.editReply(playerManagementEmbed);
    return;
}

    if (action === 'admin_select_captain_to_edit') {
        const [draftShortId] = params;
        const captainId = interaction.values[0];
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const captain = draft.captains.find(c => c.userId === captainId);

        if (!captain) {
            return interaction.reply({ content: 'Error: No se pudo encontrar a ese capitán.', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId(`admin_edit_draft_captain_modal:${draftShortId}:${captainId}`)
            .setTitle(`Editando: ${captain.teamName}`);

        const teamNameInput = new TextInputBuilder().setCustomId('team_name_input').setLabel("Nombre del Equipo").setStyle(TextInputStyle.Short).setValue(captain.teamName).setRequired(true);
        const psnIdInput = new TextInputBuilder().setCustomId('psn_id_input').setLabel("PSN ID / EA ID").setStyle(TextInputStyle.Short).setValue(captain.psnId).setRequired(true);
        const streamUrlInput = new TextInputBuilder().setCustomId('stream_url_input').setLabel("URL Completa del Stream").setStyle(TextInputStyle.Short).setValue(captain.streamChannel || '').setRequired(false).setPlaceholder('Ej: https://twitch.tv/usuario');
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(teamNameInput),
            new ActionRowBuilder().addComponents(psnIdInput),
            new ActionRowBuilder().addComponents(streamUrlInput)
        );

        await interaction.showModal(modal);
        return;
    }
    
    if (action === 'captain_invite_replacement_select') {
        await interaction.deferUpdate();
        const [draftShortId, teamId, kickedPlayerId] = params;
        const replacementPlayerId = interaction.values[0];
        
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        
        try {
            await inviteReplacementPlayer(client, draft, teamId, kickedPlayerId, replacementPlayerId);
            await interaction.editReply({ content: '✅ Invitación enviada al jugador de reemplazo.', components: [] });
        } catch(error) {
            await interaction.editReply({ content: `❌ Error: ${error.message}`, components: [] });
        }
        return;
    }

    if (action === 'draft_create_tournament_format') {
        await interaction.deferUpdate();
        const [draftShortId] = params;
        const selectedFormatId = interaction.values[0];

        try {
            const newTournament = await createTournamentFromDraft(client, guild, draftShortId, selectedFormatId);
            await interaction.editReply({
                content: `✅ ¡Torneo **"${newTournament.nombre}"** creado con éxito a partir del draft! Ya puedes gestionarlo desde su propio hilo en el canal de administración.`,
                components: []
            });

            const managementThread = await client.channels.fetch(newTournament.discordMessageIds.managementThreadId);
            const startDrawButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_force_draw:${newTournament.shortId}`)
                    .setLabel('Iniciar Sorteo Inmediatamente')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎲')
            );
            await managementThread.send({
                content: 'El torneo ha sido poblado con los equipos del draft. ¿Quieres iniciar el sorteo de la fase de grupos ahora?',
                components: [startDrawButton]
            });

        } catch (error) {
            console.error(error);
            await interaction.editReply({
                content: `❌ Hubo un error crítico al crear el torneo desde el draft: ${error.message}`,
                components: []
            });
        }
        return;
    }

    if (action === 'create_draft_type') {
        const [name] = params;
        const type = interaction.values[0];

        if (type === 'gratis') {
            await interaction.deferUpdate();
            const isPaid = false;
            const shortId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const config = { isPaid, entryFee: 0, prizeCampeon: 0, prizeFinalista: 0 };

            try {
                await createNewDraft(client, guild, name, shortId, config);
                await interaction.editReply({ content: `✅ ¡Éxito! El draft gratuito **"${name}"** ha sido creado.`, components: [] });
            } catch (error) {
                console.error("Error capturado por el handler al crear el draft:", error);
                await interaction.editReply({ content: `❌ Ocurrió un error: ${error.message}`, components: [] });
            }
        } else { // type === 'pago'
            const modal = new ModalBuilder()
                .setCustomId(`create_draft_paid_modal:${name}`)
                .setTitle(`Crear Draft de Pago: ${name}`);

            const entryFeeInput = new TextInputBuilder()
                .setCustomId('draft_entry_fee')
                .setLabel("Cuota de Inscripción por Jugador (€)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Ej: 5');
            
            const prizeCInput = new TextInputBuilder()
                .setCustomId('draft_prize_campeon')
                .setLabel("Premio Equipo Campeón (€)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Ej: 300');

            const prizeFInput = new TextInputBuilder()
                .setCustomId('draft_prize_finalista')
                .setLabel("Premio Equipo Subcampeón (€)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue('0');

            modal.addComponents(
                new ActionRowBuilder().addComponents(entryFeeInput),
                new ActionRowBuilder().addComponents(prizeCInput),
                new ActionRowBuilder().addComponents(prizeFInput)
            );
            await interaction.showModal(modal);
        }
        return;
    }

    if (action === 'admin_kick_participant_draft_select') {
        await interaction.deferUpdate();
        const [draftShortId] = params;
        const userIdToKick = interaction.values[0];
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        await kickPlayerFromDraft(client, draft, userIdToKick);

        await interaction.editReply({ content: `✅ El participante ha sido expulsado del draft.`, components: [] });
        return;
    }

    if (action === 'admin_kick_participant_page_select') {
        await interaction.deferUpdate();
        const [draftShortId] = params;
        const page = parseInt(interaction.values[0].replace('page_', ''));
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const allParticipants = [...draft.captains, ...draft.players.filter(p => !p.isCaptain)];
        
        const pageSize = 25;
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        const participantsPage = allParticipants.slice(startIndex, endIndex);

        const options = participantsPage.map(p => {
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
            .setPlaceholder(`Selecciona de la Página ${page + 1}`)
            .addOptions(options);

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
            .setPlaceholder('Selecciona otra página')
            .addOptions(pageOptions);
        
        await interaction.editReply({
            content: 'Selecciona un participante de la lista para expulsarlo del draft. Esta acción es irreversible.',
            components: [new ActionRowBuilder().addComponents(pageMenu), new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'draft_register_captain_pos_select') {
        const [draftShortId] = params;
        const position = interaction.values[0];

        const platformButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`select_stream_platform:twitch:register_draft_captain:${draftShortId}:${position}`).setLabel('Twitch').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`select_stream_platform:youtube:register_draft_captain:${draftShortId}:${position}`).setLabel('YouTube').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({
            content: `Has seleccionado **${DRAFT_POSITIONS[position]}**. Ahora, selecciona tu plataforma de transmisión.`,
            components: [platformButtons]
        });
        return;
    }

if (action === 'draft_register_player_pos_select_primary') {
    const [draftShortId] = params;
    const primaryPosition = interaction.values[0];

    // Filtramos la posición primaria de las opciones de la secundaria
    const positionOptions = Object.entries(DRAFT_POSITIONS)
        .filter(([key]) => key !== primaryPosition) // <-- LÍNEA CLAVE
        .map(([key, value]) => ({
            label: value,
            value: key
        }));
    
    // Ponemos "No tengo" al principio
    positionOptions.unshift({
        label: 'No tengo posición secundaria',
        value: 'NONE',
        emoji: '✖️'
    });

    const secondaryPosMenu = new StringSelectMenuBuilder()
        .setCustomId(`draft_register_player_pos_select_secondary:${draftShortId}:${primaryPosition}`)
        .setPlaceholder('Paso 2: Selecciona tu posición SECUNDARIA')
        .addOptions(positionOptions);
    
    await interaction.update({
        content: `Has elegido **${DRAFT_POSITIONS[primaryPosition]}** como primaria. Ahora, selecciona tu posición secundaria.`,
        components: [new ActionRowBuilder().addComponents(secondaryPosMenu)]
    });
    return;
}

    if (action === 'draft_register_player_pos_select_secondary') {
        const [draftShortId, primaryPosition] = params;
        const secondaryPosition = interaction.values[0];
        
        const secondaryPositionLabel = secondaryPosition === 'NONE' ? 'Ninguna' : DRAFT_POSITIONS[secondaryPosition];

        const statusMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_register_player_status_select:${draftShortId}:${primaryPosition}:${secondaryPosition}`)
            .setPlaceholder('Paso 3: ¿Tienes equipo actualmente?')
            .addOptions([
                { label: 'Soy Agente Libre', value: 'Libre', emoji: '👋' },
                { label: 'Tengo Equipo', value: 'Con Equipo', emoji: '🛡️' }
            ]);

        await interaction.update({
            content: `Posiciones seleccionadas: **${DRAFT_POSITIONS[primaryPosition]}** (Primaria) y **${secondaryPositionLabel}** (Secundaria).\n\nÚltimo paso, ¿cuál es tu situación actual?`,
            components: [new ActionRowBuilder().addComponents(statusMenu)]
        });
        return;
    }

if (action === 'draft_register_player_status_select') {
    const [draftShortId, primaryPosition, secondaryPosition] = params;
    const teamStatus = interaction.values[0];
    const db = getDb();
    const verifiedData = await db.collection('verified_users').findOne({ discordId: interaction.user.id });

    // --- INICIO DE LA LÓGICA DE COMPROBACIÓN DE WHATSAPP PARA JUGADORES ---
    if (verifiedData && !verifiedData.whatsapp) {
        const whatsappModal = new ModalBuilder()
            .setCustomId(`add_whatsapp_to_profile_modal:player:${draftShortId}:${primaryPosition}:${secondaryPosition}:${teamStatus}`)
            .setTitle('Dato Requerido: WhatsApp');
        const infoInput = new TextInputBuilder().setCustomId('info').setLabel("¡Hola! Necesitamos un dato más.").setStyle(TextInputStyle.Paragraph).setValue("Hemos actualizado el bot y ahora es obligatorio registrar un número de WhatsApp. Por favor, añádelo a continuación para poder continuar. Solo se te pedirá esta vez.").setRequired(false);
        const whatsappInput = new TextInputBuilder().setCustomId('whatsapp_input').setLabel("Tu WhatsApp (Ej: +34 123456789)").setStyle(TextInputStyle.Short).setRequired(true);
        const whatsappConfirmInput = new TextInputBuilder().setCustomId('whatsapp_confirm_input').setLabel("Confirma tu WhatsApp").setStyle(TextInputStyle.Short).setRequired(true);
        
        whatsappModal.addComponents(new ActionRowBuilder().addComponents(infoInput), new ActionRowBuilder().addComponents(whatsappInput), new ActionRowBuilder().addComponents(whatsappConfirmInput));
        return interaction.showModal(whatsappModal);
    }
    // --- FIN DE LA LÓGICA DE COMPROBACIÓN ---

    if (verifiedData && teamStatus === 'Libre') {
        await interaction.deferUpdate();
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const playerData = { 
            userId: interaction.user.id, userName: interaction.user.tag, 
            psnId: verifiedData.gameId, twitter: verifiedData.twitter, whatsapp: verifiedData.whatsapp,
            primaryPosition, secondaryPosition, currentTeam: 'Libre', 
            isCaptain: false, captainId: null 
        };
        await db.collection('drafts').updateOne({ _id: draft._id }, { $push: { players: playerData } });
        await interaction.editReply({ content: `✅ ¡Inscripción completada! Hemos usado tus datos verificados.`, components: [] });
        
        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        await updateDraftMainInterface(client, updatedDraft.shortId);
        await updatePublicMessages(client, updatedDraft);
        await notifyVisualizer(updatedDraft);
        return;
    }

    const modal = new ModalBuilder().setTitle('Finalizar Inscripción de Jugador');
    if (verifiedData && teamStatus === 'Con Equipo') {
        modal.setCustomId(`register_draft_player_team_name_modal:${draftShortId}:${primaryPosition}:${secondaryPosition}`);
        const currentTeamInput = new TextInputBuilder().setCustomId('current_team_input').setLabel("Nombre de tu equipo actual").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(currentTeamInput));
    } else {
        modal.setCustomId(`register_draft_player_modal:${draftShortId}:${primaryPosition}:${secondaryPosition}:${teamStatus}`);
        const psnIdInput = new TextInputBuilder().setCustomId('psn_id_input').setLabel("Tu PSN ID / EA ID").setStyle(TextInputStyle.Short).setRequired(true);
        const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu Twitter (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(psnIdInput), new ActionRowBuilder().addComponents(twitterInput));
        if (teamStatus === 'Con Equipo') {
            const currentTeamInput = new TextInputBuilder().setCustomId('current_team_input').setLabel("Nombre de tu equipo actual").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(currentTeamInput));
        }
    }
    
    await interaction.showModal(modal);
    return;
}
if (action === 'draft_pick_by_position') {
    await interaction.deferUpdate();
    const [draftShortId, captainId] = params;
    const selectedPosition = interaction.values[0];

    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    const availablePlayers = draft.players.filter(p => !p.isCaptain && !p.captainId);
    
    let playersToShow = availablePlayers.filter(p => p.primaryPosition === selectedPosition);
    let searchMode = 'Primaria';

    if (playersToShow.length === 0) {
        playersToShow = availablePlayers.filter(p => p.secondaryPosition === selectedPosition);
        searchMode = 'Secundaria';
    }

    if (playersToShow.length === 0) {
        return interaction.editReply({
            content: `No hay jugadores disponibles para la posición ${DRAFT_POSITIONS[selectedPosition]}. Por favor, cancela y elige otra posición.`,
            components: []
        });
    }
    
    playersToShow.sort((a,b) => a.psnId.localeCompare(b.psnId));

    const playerMenu = new StringSelectMenuBuilder()
        .setCustomId(`draft_pick_player:${draftShortId}:${captainId}:${selectedPosition}`)
        .setPlaceholder('Paso 2: ¡Elige al jugador!')
        .addOptions(
            playersToShow.slice(0, 25).map(player => ({
                label: player.psnId,
                description: `Discord: ${player.userName}`,
                value: player.userId,
            }))
        );
    
    await interaction.editReply({ 
        content: `Mostrando jugadores para **${DRAFT_POSITIONS[selectedPosition]}** (encontrados por posición **${searchMode}**):`, 
        components: [new ActionRowBuilder().addComponents(playerMenu)] 
    });
    return;
}
    
    if (action === 'draft_pick_player') {
        await interaction.deferUpdate();
        const [draftShortId, captainId, pickedForPosition] = params;
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (interaction.user.id !== captainId && !isAdmin) {
            return interaction.followUp({ content: 'No es tu turno de elegir.', flags: [MessageFlags.Ephemeral] });
        }
        const selectedPlayerId = interaction.values[0];
    
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const player = draft.players.find(p => p.userId === selectedPlayerId);
    
        const confirmationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`draft_confirm_pick:${draftShortId}:${captainId}:${selectedPlayerId}:${pickedForPosition}`)
                .setLabel('Confirmar y Finalizar Turno')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`draft_undo_pick:${draftShortId}:${captainId}`)
                .setLabel('Elegir Otro Jugador')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('↩️')
        );
        
        await interaction.editReply({ 
            content: `Has seleccionado a **${player.psnId}** (${player.userName}). ¿Confirmas tu elección?`, 
            components: [confirmationRow] 
        });
        return;
    }

    if (action === 'admin_set_channel_icon') {
    const [channelId] = params;
    const selectedIcon = interaction.values[0];
    
    // 1. Respondemos INMEDIATAMENTE para evitar el timeout.
    await interaction.update({ 
        content: `✅ ¡Orden recibida! El icono del canal se actualizará a ${selectedIcon} en unos segundos.`, 
        components: [] 
    });

    // 2. AHORA, hacemos el trabajo sin prisa.
    await setChannelIcon(client, channelId, selectedIcon);
    
    return;
}

    if (action === 'admin_assign_cocap_team_select') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const selectedCaptainId = interaction.values[0];

        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId(`admin_assign_cocap_user_select:${tournamentShortId}:${selectedCaptainId}`)
            .setPlaceholder('Paso 2: Busca y selecciona al nuevo co-capitán...')
            .setMinValues(1)
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(userSelectMenu);
        
        await interaction.editReply({
            content: 'Ahora, selecciona al miembro del servidor que quieres asignar como co-capitán de este equipo.',
            components: [row],
        });
        return;
    }

    if (action === 'admin_assign_cocap_user_select') {
        await interaction.deferUpdate();
        const [tournamentShortId, captainId] = params;
        const coCaptainId = interaction.values[0];

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.', components: [] });

        const team = tournament.teams.aprobados[captainId];
        if (!team) return interaction.editReply({ content: 'Error: El equipo seleccionado ya no existe.', components: [] });
        if (team.coCaptainId) return interaction.editReply({ content: 'Error: Este equipo ya tiene un co-capitán.', components: [] });

        const coCaptainUser = await client.users.fetch(coCaptainId);
        if (coCaptainUser.bot) {
            return interaction.editReply({ content: 'No puedes asignar a un bot como co-capitán.', components: [] });
        }

        const allCaptainsAndCoCaptains = Object.values(tournament.teams.aprobados).flatMap(t => [t.capitanId, t.coCaptainId]).filter(Boolean);
        if (allCaptainsAndCoCaptains.includes(coCaptainId)) {
            return interaction.editReply({ content: '❌ Esta persona ya participa en el torneo como capitán o co-capitán.', components: [] });
        }

        try {
            await addCoCaptain(client, tournament, captainId, coCaptainId);
            
            const captainUser = await client.users.fetch(captainId);
            await captainUser.send(`ℹ️ Un administrador te ha asignado a **${coCaptainUser.tag}** como co-capitán de tu equipo **${team.nombre}**.`);

            await coCaptainUser.send(`ℹ️ Un administrador te ha asignado como co-capitán del equipo **${team.nombre}** (Capitán: ${captainUser.tag}) en el torneo **${tournament.nombre}**.`);
            
            await interaction.editReply({ content: `✅ **${coCaptainUser.tag}** ha sido asignado como co-capitán del equipo **${team.nombre}**.`, components: [] });
        } catch (error) {
            console.error('Error al asignar co-capitán por admin:', error);
            await interaction.editReply({ content: 'Hubo un error al procesar la asignación.', components: [] });
        }
        return;
    }

    if (action === 'admin_create_format') {
        const formatId = interaction.values[0];
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_create_type:${formatId}`)
            .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
            .addOptions([{ label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' }]);
        
        await interaction.update({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[formatId].label}**. Ahora, el tipo:`, components: [new ActionRowBuilder().addComponents(typeMenu)] });

    } else if (action === 'admin_create_type') {
    const [formatId] = params;
    const type = interaction.values[0];

    // Volvemos a mostrar el menú de tipo de partido como un paso intermedio
    const matchTypeMenu = new StringSelectMenuBuilder()
        .setCustomId(`admin_create_match_type:${formatId}:${type}`)
        .setPlaceholder('Paso 3: Selecciona el tipo de partidos')
        .addOptions([
            {
                label: 'Solo Ida (3 Jornadas)',
                description: 'Los equipos de cada grupo se enfrentan una vez.',
                value: 'ida'
            },
            {
                label: 'Ida y Vuelta (6 Jornadas)',
                description: 'Los equipos de cada grupo se enfrentan dos veces.',
                value: 'idavuelta'
            }
        ]);
    
    // La clave es usar .update() para responder a la interacción del menú anterior
    await interaction.update({
        content: `Tipo seleccionado: **${type === 'pago' ? 'De Pago' : 'Gratuito'}**. Ahora, define las rondas:`,
        components: [new ActionRowBuilder().addComponents(matchTypeMenu)]
    });
    return;
}
     else if (action === 'admin_change_format_select') {
        await interaction.deferUpdate();
        
        const [tournamentShortId] = params;
        const newFormatId = interaction.values[0];
        await updateTournamentConfig(interaction.client, tournamentShortId, { formatId: newFormatId });

        await interaction.editReply({ content: `✅ Formato actualizado a: **${TOURNAMENT_FORMATS[newFormatId].label}**.`, components: [] });

    } else if (action === 'admin_change_type_select') {
        const [tournamentShortId] = params;
        const newType = interaction.values[0];

        if (newType === 'pago') {
            const modal = new ModalBuilder().setCustomId(`edit_payment_details_modal:${tournamentShortId}`).setTitle('Detalles del Torneo de Pago');
            const feeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Cuota de Inscripción (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('5');
            const prizeCInput = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('40');
            const prizeFInput = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('0');
            modal.addComponents( new ActionRowBuilder().addComponents(feeInput), new ActionRowBuilder().addComponents(prizeCInput), new ActionRowBuilder().addComponents(prizeFInput) );
            await interaction.showModal(modal);
        } else {
            await interaction.deferUpdate();
            await updateTournamentConfig(interaction.client, tournamentShortId, { isPaid: false, entryFee: 0, prizeCampeon: 0, prizeFinalista: 0 });
            await interaction.editReply({ content: `✅ Torneo actualizado a: **Gratuito**.`, components: [] });
        }
    } else if (action === 'invite_cocaptain_select') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        const captainId = interaction.user.id;
        const team = tournament.teams.aprobados[captainId];
        if (!team) return interaction.editReply({ content: 'Error: No eres el capitán de un equipo en este torneo.' });
        if (team.coCaptainId) return interaction.editReply({ content: 'Ya tienes un co-capitán.'});
        
        const coCaptainId = interaction.values[0];
        const coCaptainUser = await client.users.fetch(coCaptainId);
        
        const allCaptainsAndCoCaptains = Object.values(tournament.teams.aprobados).flatMap(t => [t.capitanId, t.coCaptainId]).filter(Boolean);
        if (allCaptainsAndCoCaptains.includes(coCaptainId)) {
            return interaction.editReply({ content: '❌ Esta persona ya participa en el torneo como capitán o co-capitán.' });
        }
        if (coCaptainUser.bot) {
            return interaction.editReply({ content: 'No puedes invitar a un bot.' });
        }

        try {
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
            await interaction.editReply({ content: `✅ Invitación enviada a **${coCaptainUser.tag}**. Recibirá un MD para aceptar o rechazar.`, components: [] });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ No se pudo enviar el MD de invitación. Es posible que el usuario tenga los mensajes directos bloqueados.', components: [] });
        }
    }
    if (action === 'admin_promote_from_waitlist') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const captainIdToPromote = interaction.values[0];

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.followUp({ content: 'Error: Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });
        }

        const teamData = tournament.teams.reserva[captainIdToPromote];
        if (!teamData) {
            return interaction.followUp({ content: 'Error: Este equipo ya no está en la lista de reserva.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            await approveTeam(client, tournament, teamData);
            await interaction.editReply({ 
                content: `✅ El equipo **${teamData.nombre}** ha sido aprobado y movido de la reserva al torneo.`,
                components: []
            });
        } catch (error) {
            console.error("Error al promover equipo desde la reserva:", error);
            await interaction.followUp({ content: `❌ Hubo un error al aprobar al equipo: ${error.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
    }
     if (action === 'verify_select_platform_manual') {
    const platform = interaction.values[0];
    const modal = new ModalBuilder()
        .setCustomId(`verification_ticket_submit:${platform}`)
        .setTitle('Verificación - Datos del Jugador');
    
    const gameIdInput = new TextInputBuilder()
        .setCustomId('game_id_input')
        .setLabel(`Tu ID en ${platform.toUpperCase()}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
        
    const twitterInput = new TextInputBuilder()
        .setCustomId('twitter_input')
        .setLabel("Tu usuario de Twitter (sin @)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    // --- INICIO DE LA MODIFICACIÓN ---
    const whatsappInput = new TextInputBuilder()
        .setCustomId('whatsapp_input')
        .setLabel("Tu WhatsApp (Ej: +34 123456789)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const whatsappConfirmInput = new TextInputBuilder()
        .setCustomId('whatsapp_confirm_input')
        .setLabel("Confirma tu WhatsApp (Escríbelo de nuevo)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    // --- FIN DE LA MODIFICACIÓN ---

    modal.addComponents(
        new ActionRowBuilder().addComponents(gameIdInput), 
        new ActionRowBuilder().addComponents(twitterInput),
        new ActionRowBuilder().addComponents(whatsappInput),       // <-- LÍNEA AÑADIDA
        new ActionRowBuilder().addComponents(whatsappConfirmInput) // <-- LÍNEA AÑADIDA
    );
    return interaction.showModal(modal);
}

    if (action === 'reject_verification_reason') {
        await interaction.deferUpdate();
        const [channelId] = params;
        const reason = interaction.values[0];
        const db = getDb();
        const ticket = await db.collection('verificationtickets').findOne({ channelId });

        // --- AÑADE ESTE BLOQUE PARA BORRAR LA NOTIFICACIÓN ---
    if (ticket.adminNotificationMessageId) {
        try {
            const adminApprovalChannel = await client.channels.fetch(ADMIN_APPROVAL_CHANNEL_ID);
            const notificationMessage = await adminApprovalChannel.messages.fetch(ticket.adminNotificationMessageId);
            await notificationMessage.delete();
        } catch (error) {
            console.warn(`[CLEANUP] No se pudo borrar el mensaje de notificación del ticket ${ticket._id}. Puede que ya no existiera.`, error.message);
        }
    }
    // --- FIN DEL BLOQUE A AÑADIR ---

        let reasonText = '';
        if (reason === 'inactivity') {
            reasonText = 'Tu solicitud de verificación ha sido rechazada debido a inactividad. No has proporcionado las pruebas necesarias en el tiempo establecido.';
        } else {
            reasonText = 'Tu solicitud de verificación ha sido rechazada porque las pruebas proporcionadas eran insuficientes o no válidas. Por favor, asegúrate de seguir las instrucciones correctamente si lo intentas de nuevo.';
        }
        
        const user = await client.users.fetch(ticket.userId).catch(() => null);
        if (user) {
            try {
                await user.send(`❌ **Verificación Rechazada**\n\n${reasonText}`);
            } catch(e) { console.warn(`No se pudo enviar MD de rechazo al usuario ${user.id}`); }
        }

        await db.collection('verificationtickets').updateOne({ _id: ticket._id }, { $set: { status: 'closed' } });
        const channel = await client.channels.fetch(channelId);
        await channel.send(`❌ Verificación rechazada por <@${interaction.user.id}>. Motivo: ${reason === 'inactivity' ? 'Inactividad' : 'Pruebas insuficientes'}. Este canal se cerrará en 10 segundos.`);
        
        const originalMessage = await channel.messages.fetch(interaction.message.reference.messageId);
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        const finalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        finalEmbed.data.fields.find(f => f.name === 'Estado').value = `❌ **Rechazado por:** <@${interaction.user.id}>`;
        await originalMessage.edit({ embeds: [finalEmbed], components: [disabledRow] });
        
        await interaction.editReply({ content: 'Rechazo procesado.', components: [] });
        setTimeout(() => channel.delete().catch(console.error), 10000);
    }
    if (action === 'admin_edit_verified_user_select') {
    const userId = interaction.values[0];
    const db = getDb();

    const userRecord = await db.collection('verified_users').findOne({ discordId: userId });
    if (!userRecord) {
        return interaction.update({ content: '❌ Este usuario no tiene un perfil verificado en la base de datos.', components: [], embeds: [] });
    }

    let playerRecord = await db.collection('player_records').findOne({ userId: userId });
    const currentStrikes = playerRecord ? playerRecord.strikes : 0;

    const user = await client.users.fetch(userId);

    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle(`✏️ Editando Perfil de ${user.tag}`)
        .setDescription('**Datos Actuales:**')
        .addFields(
            { name: 'ID de Juego', value: `\`${userRecord.gameId}\``, inline: true },
            { name: 'Plataforma', value: `\`${userRecord.platform.toUpperCase()}\``, inline: true },
            { name: 'Twitter', value: `\`${userRecord.twitter}\``, inline: true },
            { name: 'WhatsApp', value: `\`${userRecord.whatsapp || 'No registrado'}\``, inline: true }, // <-- LÍNEA AÑADIDA
            { name: 'Strikes Actuales', value: `\`${currentStrikes}\``, inline: true }
        )
        .setFooter({ text: 'Por favor, selecciona el campo que deseas modificar.' });
    
    const fieldMenu = new StringSelectMenuBuilder()
        .setCustomId(`admin_edit_verified_field_select:${userId}`)
        .setPlaceholder('Selecciona el dato a cambiar')
        .addOptions([
            { label: 'ID de Juego', value: 'gameId' },
            { label: 'Twitter', value: 'twitter' },
            { label: 'WhatsApp', value: 'whatsapp' }, // <-- LÍNEA AÑADIDA
            { label: 'Strikes', value: 'strikes' }
        ]);
    
    return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(fieldMenu)], content: '' });
}

if (action === 'admin_edit_verified_field_select') {
    const [userId] = params;
    const fieldToEdit = interaction.values[0];

    // Si es cualquiera de estos tres, usamos el mismo modal
    if (['gameId', 'twitter', 'whatsapp'].includes(fieldToEdit)) {
        const modal = new ModalBuilder()
            .setCustomId(`admin_edit_verified_submit:${userId}:${fieldToEdit}`)
            .setTitle(`Cambiar ${fieldToEdit}`);
        const newValueInput = new TextInputBuilder().setCustomId('new_value_input').setLabel("Nuevo Valor").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(newValueInput));
        return interaction.showModal(modal);

    } else if (fieldToEdit === 'strikes') {
        const modal = new ModalBuilder()
            .setCustomId(`admin_edit_strikes_submit:${userId}`)
            .setTitle(`Establecer Strikes`);
        const strikesInput = new TextInputBuilder().setCustomId('strikes_input').setLabel("Nuevo número total de strikes").setStyle(TextInputStyle.Short).setPlaceholder("Ej: 0, 1, 2...").setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(strikesInput));
        return interaction.showModal(modal);
    }
}
    if (action === 'consult_player_data_select') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const [draftShortId] = params;
    const selectedUserId = interaction.values[0];

    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    const user = await client.users.fetch(selectedUserId);

    const verifiedData = await db.collection('verified_users').findOne({ discordId: selectedUserId });
    const draftPlayerData = draft.players.find(p => p.userId === selectedUserId);

    if (!verifiedData && !draftPlayerData) {
        return interaction.editReply({ content: `❌ El usuario ${user.tag} no está ni verificado ni inscrito en este draft.` });
    }

    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle(`ℹ️ Ficha de Datos: ${user.tag}`)
        .setThumbnail(user.displayAvatarURL());

    if (verifiedData) {
        embed.addFields(
            { name: '📋 Datos de Verificación', value: '\u200B' },
            { name: 'ID de Juego', value: `\`${verifiedData.gameId}\``, inline: true },
            { name: 'Plataforma', value: `\`${verifiedData.platform.toUpperCase()}\``, inline: true },
            { name: 'Twitter', value: `\`${verifiedData.twitter}\``, inline: true },
            { name: 'WhatsApp', value: `\`${verifiedData.whatsapp || 'No registrado'}\``, inline: true }
        );
    } else {
        embed.addFields({ name: '📋 Datos de Verificación', value: 'El usuario no está verificado.' });
    }

    if (draftPlayerData) {
        const captain = draftPlayerData.captainId ? draft.captains.find(c => c.userId === draftPlayerData.captainId) : null;
        embed.addFields(
            { name: '📝 Datos del Draft Actual', value: '\u200B' },
            { name: 'Posición Primaria', value: `\`${draftPlayerData.primaryPosition}\``, inline: true },
            { name: 'Posición Secundaria', value: `\`${draftPlayerData.secondaryPosition || 'N/A'}\``, inline: true },
            { name: 'Equipo Actual (Club)', value: `\`${draftPlayerData.currentTeam || 'N/A'}\``, inline: true },
            { name: 'Fichado por (Draft)', value: captain ? `\`${captain.teamName}\`` : '`Agente Libre`', inline: true }
        );
    } else {
         embed.addFields({ name: '📝 Datos del Draft Actual', value: 'El usuario no está inscrito en este draft.' });
    }

    await interaction.editReply({ embeds: [embed] });
    return;
}
    if (action === 'admin_select_channel_to_update_icon') {
    const channelId = interaction.values[0];
    const statusMenu = new StringSelectMenuBuilder()
        .setCustomId(`admin_set_channel_icon:${channelId}`) 
        .setPlaceholder('Paso 2: Selecciona el estado del canal')
        .addOptions([
            { label: 'Verde (Inscripciones Abiertas)', value: '🟢', emoji: '🟢' },
            { label: 'Azul (En Juego / Lleno)', value: '🔵', emoji: '🔵' },
            { label: 'Rojo (Inactivo)', value: '🔴', emoji: '🔴' }
        ]);

    const row = new ActionRowBuilder().addComponents(statusMenu);

    await interaction.update({
        content: 'Canal seleccionado. Ahora, elige el icono de estado que quieres establecer:',
        components: [row]
    });
    return;
}
    else if (action === 'admin_create_match_type') {
    const [formatId, type] = params;
    const matchType = interaction.values[0];

    const modal = new ModalBuilder()
        .setCustomId(`create_tournament:${formatId}:${type}:${matchType}`)
        .setTitle('Finalizar Creación de Torneo');
    
    const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
    const startTimeInput = new TextInputBuilder().setCustomId('torneo_start_time').setLabel("Fecha/Hora de Inicio (ej: Sáb 20, 22:00 CET)").setStyle(TextInputStyle.Short).setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(nombreInput), new ActionRowBuilder().addComponents(startTimeInput));

    if (type === 'pago') {
        modal.setTitle('Finalizar Creación (De Pago)');

        const entryFeeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Inscripción por Equipo (€)").setStyle(TextInputStyle.Short).setRequired(true);
        const prizeInputCampeon = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true);
        const prizeInputFinalista = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('0');
        
        // --- INICIO DE LA MODIFICACIÓN ---
        const paypalInput = new TextInputBuilder()
            .setCustomId('torneo_paypal_email')
            .setLabel("Email de PayPal (Opcional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('tu.email@ejemplo.com');

        const bizumInput = new TextInputBuilder()
            .setCustomId('torneo_bizum_number')
            .setLabel("Nº de Bizum (Opcional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('Ej: 600111222');

        modal.addComponents(
            new ActionRowBuilder().addComponents(entryFeeInput),
            new ActionRowBuilder().addComponents(prizeInputCampeon),
            new ActionRowBuilder().addComponents(prizeInputFinalista),
            new ActionRowBuilder().addComponents(paypalInput),
            new ActionRowBuilder().addComponents(bizumInput)
        );
        // --- FIN DE LA MODIFICACIÓN ---
    }
    await interaction.showModal(modal);
}
    if (action === 'view_free_agent_details') {
    await interaction.deferUpdate();
    const [draftShortId] = params;
    const selectedPlayerId = interaction.values[0];

    const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
    const player = draft.players.find(p => p.userId === selectedPlayerId);
    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

    // Llamamos a la ficha en modo 'view' para que NO muestre los botones de acción
    const playerViewEmbed = await createPlayerManagementEmbed(player, draft, null, isAdmin, 'view');
    await interaction.editReply(playerViewEmbed);
    return;
}
}
