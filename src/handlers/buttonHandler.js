// src/handlers/buttonHandler.js
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS } from '../../config.js';
import { approveTeam, endTournament, startGroupStage } from '../logic/tournamentLogic.js';
import { findMatch } from '../logic/matchLogic.js';
import { updateAdminPanel } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';

export async function handleButton(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();

    // --- GRUPO 1: Acciones que abren un Modal ---
    if (customId.startsWith('inscribir_equipo_start') || customId.startsWith('admin_modify_result_start') || customId.startsWith('payment_confirm_start') || customId.startsWith('admin_add_test_teams')) {
        let modal;
        if (customId.startsWith('inscribir_equipo_start')) {
            const tournamentShortId = customId.split('_').pop();
            modal = new ModalBuilder().setCustomId(`inscripcion_modal_${tournamentShortId}`).setTitle('Inscripción de Equipo / Team Registration');
            const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (3-15 chars)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(15).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput));
        } else if (customId.startsWith('payment_confirm_start')) {
            const tournamentShortId = customId.split('_').pop();
            modal = new ModalBuilder().setCustomId(`payment_confirm_modal_${tournamentShortId}`).setTitle('Confirmar Pago / Confirm Payment');
            // ¡¡¡CORRECCIÓN DEFINITIVA AQUÍ!!! Etiqueta acortada.
            const paypalInput = new TextInputBuilder().setCustomId('user_paypal_input').setLabel("Tu PayPal (para premios)").setStyle(TextInputStyle.Short).setPlaceholder('tu.email@ejemplo.com').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
        } else if (customId.startsWith('admin_add_test_teams')) {
            const tournamentShortId = customId.split('_').pop();
            modal = new ModalBuilder().setCustomId(`add_test_teams_modal_${tournamentShortId}`).setTitle('Añadir Equipos de Prueba / Add Test Teams');
            const amountInput = new TextInputBuilder().setCustomId('amount_input').setLabel("¿Cuántos equipos de prueba? / How many?").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        } else { // admin_modify_result_start
            const parts = customId.split('_');
            const tournamentShortId = parts.pop();
            const matchId = parts.pop();
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
        return;
    }

    // --- GRUPO 2: Acciones que actualizan el mensaje actual ---
    if (customId.startsWith('user_view_details') || customId.startsWith('user_hide_details') || customId.startsWith('admin_return_to_main_panel')) {
        await interaction.deferUpdate();
        if (customId.startsWith('admin_return_to_main_panel')) {
             await updateAdminPanel(client, interaction.message);
        }
        // Aquí se podría añadir la lógica para user_view/hide_details
        return;
    }
    
    // --- GRUPO 3: El resto de acciones ---
    
    if (customId.startsWith('admin_create_tournament_start')) {
        const formatMenu = new StringSelectMenuBuilder().setCustomId('admin_create_format').setPlaceholder('Paso 1: Selecciona el formato del torneo').addOptions(Object.keys(TOURNAMENT_FORMATS).map(key => ({ label: TOURNAMENT_FORMATS[key].label, description: TOURNAMENT_FORMATS[key].description.slice(0, 100), value: key })));
        await interaction.reply({ content: 'Iniciando creación de torneo...', components: [new ActionRowBuilder().addComponents(formatMenu)], flags: [MessageFlags.Ephemeral] });
        return;
    }

    // Para todas las demás acciones (approve, end, etc.), que son lentas, usamos deferReply.
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    if (customId.startsWith('admin_approve')) {
        const [, , captainId, tournamentShortId] = customId.split('_');
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || !tournament.teams.pendientes[captainId]) return interaction.editReply({ content: 'Error o acción ya procesada.' });
        await approveTeam(client, tournament, tournament.teams.pendientes[captainId]);
        const originalMessage = interaction.message;
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await originalMessage.edit({ components: [disabledRow] });
        await interaction.editReply(`✅ Equipo aprobado.`);
        return;
    }
    
    if (customId.startsWith('admin_end_tournament')) {
        const tournamentShortId = customId.split('_').pop();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: No se pudo encontrar ese torneo.' });
        await interaction.editReply({ content: `⏳ Recibido. Finalizando el torneo **${tournament.nombre}**. El panel se actualizará solo.` });
        setBotBusy(true);
        await updateAdminPanel(client);
        try {
            await endTournament(client, tournament);
        } catch (e) {
            console.error("Error crítico al finalizar torneo:", e);
        } finally {
            setBotBusy(false);
            await updateAdminPanel(client);
        }
        return;
    }
}
