// src/handlers/buttonHandler.js
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS } from '../../config.js';
import { approveTeam, endTournament, startGroupStage } from '../logic/tournamentLogic.js';
import { findMatch } from '../logic/matchLogic.js';
import { createTournamentStatusEmbed, createTournamentManagementPanel } from '../utils/embeds.js';
import { setBotBusy } from '../../index.js';
import { updateAdminPanel } from '../utils/panelManager.js';

export async function handleButton(interaction) {
    // REGLA DE ORO: Responder primero, actuar después.
    // La naturaleza de la respuesta depende del tipo de botón.

    const [action, ...params] = interaction.customId.split('_');
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();

    // --- GRUPO 1: Acciones que abren un Modal ---
    if (interaction.customId.startsWith('inscribir_equipo_start') || interaction.customId.startsWith('admin_modify_result_start')) {
        let modal;
        if (interaction.customId.startsWith('inscribir_equipo_start')) {
            const tournamentShortId = params[2];
            modal = new ModalBuilder().setCustomId(`inscripcion_modal_${tournamentShortId}`).setTitle('Inscripción de Equipo');
            const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (3-15 chars)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(15).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput));
        } else { // admin_modify_result_start
            const [, , , , matchId, tournamentShortId] = interaction.customId.split('_');
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) return;
            const { partido } = findMatch(tournament, matchId);
            if (!partido) return;
            modal = new ModalBuilder().setCustomId(`admin_force_result_modal_${matchId}_${tournamentShortId}`).setTitle('Forzar Resultado (Admin)');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        }
        await interaction.showModal(modal);
        return; // Termina la ejecución aquí.
    }

    // --- GRUPO 2: Acciones que actualizan el mensaje actual ---
    if (['user_view_details', 'user_hide_details', 'admin_return_to_main_panel'].some(p => interaction.customId.startsWith(p))) {
        await interaction.deferUpdate();
        
        if (interaction.customId.startsWith('admin_return_to_main_panel')) {
             await updateAdminPanel(interaction.message, client);
        }
        // Añadir aquí la lógica para view/hide details, que ya tenías.
        return;
    }

    // --- GRUPO 3: El resto de acciones que pueden tardar ---
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    if (interaction.customId.startsWith('admin_create_tournament_start')) {
        const formatMenu = new StringSelectMenuBuilder().setCustomId('admin_create_format').setPlaceholder('Paso 1: Selecciona el formato del torneo').addOptions(Object.keys(TOURNAMENT_FORMATS).map(key => ({ label: TOURNAMENT_FORMATS[key].label, description: TOURNAMENT_FORMATS[key].description.slice(0, 100), value: key })));
        await interaction.editReply({ content: 'Iniciando creación de torneo...', components: [new ActionRowBuilder().addComponents(formatMenu)] });
        return;
    }

    if (interaction.customId.startsWith('admin_approve')) {
        const [, captainId, tournamentShortId] = interaction.customId.split('_');
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || !tournament.teams.pendientes[captainId]) return interaction.editReply({ content: 'Error o acción ya procesada.' });

        await approveTeam(client, tournament, tournament.teams.pendientes[captainId]);
        
        await interaction.editReply(`✅ Equipo aprobado.`);

        const originalMessage = interaction.message;
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await originalMessage.edit({ components: [disabledRow] });
        
        try {
            const captainUser = await client.users.fetch(captainId);
            await captainUser.send(`¡Felicidades! Tu equipo **${tournament.teams.pendientes[captainId].nombre}** ha sido aprobado para el torneo **${tournament.nombre}**.`);
        } catch (e) { console.warn(`No se pudo enviar DM al capitán ${captainId}`); }
        return;
    }
    
    // ... Aquí iría el resto de tu lógica para 'force_draw', 'end_tournament', etc.
    // Todas ellas usando interaction.editReply() para dar la respuesta final.
}
