// src/handlers/selectMenuHandler.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, DRAFT_POSITIONS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } from 'discord.js';
import { updateTournamentConfig, addCoCaptain, createNewDraft, handlePlayerSelection } from '../logic/tournamentLogic.js';
import { setChannelIcon } from '../utils/panelManager.js';

export async function handleSelectMenu(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    
    const [action, ...params] = customId.split(':');

    if (action === 'create_draft_type') {
        await interaction.deferUpdate();
        const [name] = params;
        const type = interaction.values[0];
        const isPaid = type === 'pago';
        const shortId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const config = { isPaid };

        try {
            await createNewDraft(client, guild, name, shortId, config);
            await interaction.editReply({ content: `✅ ¡Éxito! El draft **"${name}"** ha sido creado.`, components: [] });
        } catch (error) {
            console.error("Error capturado por el handler al crear el draft:", error);
            await interaction.editReply({ content: `❌ Ocurrió un error al crear el draft. Revisa los logs.`, components: [] });
        }
        return;
    }

    if (action === 'draft_pick_search_type') {
        await interaction.deferUpdate();
        const [draftShortId, captainId] = params;
        const searchType = interaction.values[0];
        
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const availablePlayers = draft.players.filter(p => !p.captainId);
        
        const positions = new Set();
        availablePlayers.forEach(player => {
            const pos = searchType === 'primary' ? player.primaryPosition : player.secondaryPosition;
            positions.add(pos);
        });

        if (positions.size === 0) {
            return interaction.editReply({ content: 'No hay jugadores con posiciones que coincidan con tu búsqueda.', components: [] });
        }

        const positionMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_pick_position:${draftShortId}:${captainId}:${searchType}`)
            .setPlaceholder('Paso 2: Elige la posición')
            .addOptions(
                [...positions].map(pos => ({
                    label: DRAFT_POSITIONS[pos] || pos,
                    value: pos,
                }))
            );

        await interaction.editReply({ components: [new ActionRowBuilder().addComponents(positionMenu)] });
        return;
    }

    if (action === 'draft_pick_position') {
        await interaction.deferUpdate();
        const [draftShortId, captainId, searchType] = params;
        const selectedPosition = interaction.values[0];
        
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const availablePlayers = draft.players.filter(p => !p.captainId);

        const playersInPosition = availablePlayers.filter(player => {
            const pos = searchType === 'primary' ? player.primaryPosition : player.secondaryPosition;
            return pos === selectedPosition;
        });

        if (playersInPosition.length === 0) {
             return interaction.editReply({ content: 'No quedan jugadores en esa posición.', components: [] });
        }

        const playerMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_pick_player:${draftShortId}:${captainId}`)
            .setPlaceholder('Paso 3: ¡Elige al jugador!')
            .addOptions(
                playersInPosition.map(player => ({
                    label: player.userName,
                    description: `Posiciones: ${player.primaryPosition} / ${player.secondaryPosition}`,
                    value: player.userId,
                }))
            );
        
        await interaction.editReply({ components: [new ActionRowBuilder().addComponents(playerMenu)] });
        return;
    }

    if (action === 'draft_pick_player') {
        await interaction.deferUpdate();
        const [draftShortId, captainId] = params;
        const selectedPlayerId = interaction.values[0];

        // Llama a la lógica para asignar el jugador
        await handlePlayerSelection(client, draftShortId, captainId, selectedPlayerId);

        const player = await client.users.fetch(selectedPlayerId);

        // Muestra los botones de confirmación
        const confirmationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`draft_confirm_pick:${draftShortId}:${captainId}`)
                .setLabel('Confirmar y Finalizar Turno')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`draft_undo_pick:${draftShortId}:${captainId}`)
                .setLabel('Deshacer Selección')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('↩️')
        );
        
        await interaction.editReply({ 
            content: `Has seleccionado a **${player.tag}**. ¿Confirmas tu elección?`, 
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
        await interaction.deferUpdate();
        
        const formatId = interaction.values[0];
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_create_type:${formatId}`)
            .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
            .addOptions([{ label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' }]);
        
        await interaction.editReply({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[formatId].label}**. Ahora, el tipo:`, components: [new ActionRowBuilder().addComponents(typeMenu)] });

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
}
