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
    const [action, ...params] = interaction.customId.split('_');
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();

    // --- GRUPO 1: Acciones que abren un Modal ---
    if (interaction.customId.startsWith('inscribir_equipo_start') || interaction.customId.startsWith('admin_modify_result_start') || interaction.customId.startsWith('payment_confirm_start') || interaction.customId.startsWith('admin_add_test_teams')) {
        let modal;
        if (interaction.customId.startsWith('inscribir_equipo_start')) {
            const tournamentShortId = params[2];
            modal = new ModalBuilder().setCustomId(`inscripcion_modal_${tournamentShortId}`).setTitle('Inscripción de Equipo / Team Registration');
            const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (3-15 chars)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(15).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput));
        } else if (interaction.customId.startsWith('payment_confirm_start')) {
            const tournamentShortId = params[3];
            modal = new ModalBuilder().setCustomId(`payment_confirm_modal_${tournamentShortId}`).setTitle('Confirmar Pago y Datos / Confirm Payment & Data');
            const paypalInput = new TextInputBuilder().setCustomId('user_paypal_input').setLabel("Tu PayPal (para recibir premios) / Your PayPal").setPlaceholder('Escribe aquí tu email de PayPal.').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
        } else if (interaction.customId.startsWith('admin_add_test_teams')) {
            const tournamentShortId = params[4];
            modal = new ModalBuilder().setCustomId(`add_test_teams_modal_${tournamentShortId}`).setTitle('Añadir Equipos de Prueba / Add Test Teams');
            const amountInput = new TextInputBuilder().setCustomId('amount_input').setLabel("¿Cuántos equipos de prueba? / How many test teams?").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
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
        return;
    }

    // --- GRUPO 2: Acciones que actualizan el mensaje actual ---
    if (['user_view_details', 'user_hide_details', 'admin_return_to_main_panel'].some(p => interaction.customId.startsWith(p))) {
        await interaction.deferUpdate();
        if (interaction.customId.startsWith('admin_return_to_main_panel')) {
             await updateAdminPanel(client, interaction.message);
        }
        // ... (Aquí iría la lógica para user_view/hide_details si la necesitas)
        return;
    }
    
    // --- GRUPO 3: El resto de acciones ---
    
    if (interaction.customId.startsWith('admin_create_tournament_start')) {
        const formatMenu = new StringSelectMenuBuilder().setCustomId('admin_create_format').setPlaceholder('Paso 1: Selecciona el formato del torneo').addOptions(Object.keys(TOURNAMENT_FORMATS).map(key => ({ label: TOURNAMENT_FORMATS[key].label, description: TOURNAMENT_FORMATS[key].description.slice(0, 100), value: key })));
        await interaction.reply({ content: 'Iniciando creación de torneo...', components: [new ActionRowBuilder().addComponents(formatMenu)], flags: [MessageFlags.Ephemeral] });
        return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    if (interaction.customId.startsWith('admin_approve')) {
        const [, captainId, tournamentShortId] = interaction.customId.split('_');
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
    
    if (interaction.customId.startsWith('admin_end_tournament')) {
        const tournamentShortId = params[2];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: No se pudo encontrar ese torneo.' });

        await interaction.editReply({ content: `⏳ Recibido. Finalizando el torneo **${tournament.nombre}**. Este proceso puede tardar. El panel se actualizará solo.` });
        
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
