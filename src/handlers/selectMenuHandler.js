// src/handlers/selectMenuHandler.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, DRAFT_POSITIONS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { updateTournamentConfig, addCoCaptain, createNewDraft, handlePlayerSelection, createTournamentFromDraft, kickPlayerFromDraft, inviteReplacementPlayer, approveTeam } from '../logic/tournamentLogic.js';
import { setChannelIcon } from '../utils/panelManager.js';
import { createTeamRosterManagementEmbed, createPlayerManagementEmbed } from '../utils/embeds.js';

export async function handleSelectMenu(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    
    const [action, ...params] = customId.split(':');

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

        const playerManagementEmbed = await createPlayerManagementEmbed(player, draft, teamId, isAdmin);
        await interaction.editReply(playerManagementEmbed);
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

        const positionOptions = Object.entries(DRAFT_POSITIONS)
            .map(([key, value]) => ({
                label: value,
                value: key
            }));
        
        positionOptions.push({
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

        const modal = new ModalBuilder()
            .setCustomId(`register_draft_player_modal:${draftShortId}:${primaryPosition}:${secondaryPosition}:${teamStatus}`)
            .setTitle('Finalizar Inscripción de Jugador');

        const psnIdInput = new TextInputBuilder().setCustomId('psn_id_input').setLabel("Tu PSN ID / EA ID").setStyle(TextInputStyle.Short).setRequired(true);
        const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu Twitter (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(psnIdInput),
            new ActionRowBuilder().addComponents(twitterInput)
        );

        if (teamStatus === 'Con Equipo') {
            const currentTeamInput = new TextInputBuilder()
                .setCustomId('current_team_input')
                .setLabel("Nombre de tu equipo actual")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(currentTeamInput));
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
        .setCustomId(`draft_pick_player:${draftShortId}:${captainId}`)
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
        const [draftShortId, captainId] = params;
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (interaction.user.id !== captainId && !isAdmin) {
            return interaction.followUp({ content: 'No es tu turno de elegir.', flags: [MessageFlags.Ephemeral] });
        }
        const selectedPlayerId = interaction.values[0];
    
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const player = draft.players.find(p => p.userId === selectedPlayerId);
    
        const confirmationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`draft_confirm_pick:${draftShortId}:${captainId}:${selectedPlayerId}`)
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
        await interaction.deferUpdate();
        const selectedIcon = interaction.values[0];
        
        await setChannelIcon(client, selectedIcon);

        await interaction.editReply({ content: `✅ El estado del canal ha sido actualizado manualmente a ${selectedIcon}.`, components: [] });
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
        const modal = new ModalBuilder().setCustomId(`create_tournament:${formatId}:${type}`).setTitle('Finalizar Creación de Torneo');
        
        const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
        const startTimeInput = new TextInputBuilder().setCustomId('torneo_start_time').setLabel("Fecha/Hora de Inicio (ej: Sáb 20, 22:00 CET)").setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(nombreInput), new ActionRowBuilder().addComponents(startTimeInput));

        if (type === 'pago') {
            const entryFeeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Inscripción / Entry Fee (€)").setStyle(TextInputStyle.Short).setRequired(true);
            const prizeInputCampeon = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón / Champion Prize (€)").setStyle(TextInputStyle.Short).setRequired(true);
            const prizeInputFinalista = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista / Runner-up Prize (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('0');
            
            modal.setTitle('Finalizar Creación (De Pago)');
            modal.addComponents(
                new ActionRowBuilder().addComponents(entryFeeInput),
                new ActionRowBuilder().addComponents(prizeInputCampeon),
                new ActionRowBuilder().addComponents(prizeInputFinalista)
            );
        }
        await interaction.showModal(modal);

    } else if (action === 'admin_change_format_select') {
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
}
