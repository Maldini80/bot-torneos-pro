// src/handlers/buttonHandler.js
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS } from '../../config.js';
import { approveTeam, endTournament, startGroupStage } from '../logic/tournamentLogic.js'; // <-- AÑADIDO startGroupStage
import { findMatch } from '../logic/matchLogic.js'; // <-- AÑADIDO
import { createTournamentStatusEmbed } from '../utils/embeds.js';
import { setBotBusy } from '../../index.js';
import { updateAdminPanel } from '../utils/panelManager.js';

export async function handleButton(interaction) {
    const [action, ...params] = interaction.customId.split('_');
    const client = interaction.client;
    const guild = interaction.guild;

    if (interaction.customId.startsWith('inscribir_equipo_start') || interaction.customId.startsWith('admin_modify_result_start')) {
        // Modal handlers don't need deferring here
    } else if (['user_view_details', 'user_hide_details', 'admin_return_to_main_panel'].some(p => interaction.customId.startsWith(p))) {
        await interaction.deferUpdate();
    } else {
        await interaction.deferReply({ ephemeral: true });
    }

    // --- ACCIONES DE USUARIO ---
    if (action === 'user') {
        // ... (Tu código aquí es correcto, no necesita cambios)
    }

    // --- ACCIONES DE ADMINISTRADOR ---
    if (action === 'admin') {
        if (params[0] === 'create' && params[1] === 'tournament' && params[2] === 'start') {
            // ... (Tu código aquí es correcto)
        }
        
        if (params[0] === 'approve') {
            // ... (Tu código aquí es correcto)
        }
        
        if (params[0] === 'force_draw') { // Para el botón de "Forzar Sorteo"
            const tournamentShortId = params[2];
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');
            if (tournament.status !== 'inscripcion_abierta') return interaction.editReply('El sorteo ya se ha realizado.');
            
            await interaction.editReply(`Iniciando sorteo manualmente para **${tournament.nombre}**...`);
            await startGroupStage(client, guild, tournament);
            return;
        }

        if (params[0] === 'modify' && params[1] === 'result' && params[2] === 'start') {
            const tournamentShortId = params[4];
            const matchId = params[3];
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) return interaction.showModal(new ModalBuilder().setTitle('Error').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('error').setLabel('El torneo no existe').setStyle(TextInputStyle.Paragraph))));

            const { partido } = findMatch(tournament, matchId);
            if (!partido) return interaction.showModal(new ModalBuilder().setTitle('Error').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('error').setLabel('El partido no existe').setStyle(TextInputStyle.Paragraph))));
            
            const modal = new ModalBuilder()
                .setCustomId(`admin_force_result_modal_${matchId}_${tournamentShortId}`)
                .setTitle('Forzar Resultado (Admin)');
            
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[0] : '0');
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[1] : '0');
            
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
            return interaction.showModal(modal);
        }

        // ... (El resto de tu código para 'force_reset', 'return_to_main_panel', 'end_tournament', etc. es correcto)
    }
}
