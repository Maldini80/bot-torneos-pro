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

    // --- ACCIONES QUE ABREN UN MODAL (No necesitan defer) ---
    if (interaction.customId.startsWith('inscribir_equipo_start')) {
        const tournamentShortId = params[2];
        const modal = new ModalBuilder().setCustomId(`inscripcion_modal_${tournamentShortId}`).setTitle('Inscripción de Equipo');
        const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (3-15 caracteres)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(15).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput));
        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId.startsWith('admin_modify_result_start')) {
        const [, , , , matchId, tournamentShortId] = interaction.customId.split('_');
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: 'Error: Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });

        const { partido } = findMatch(tournament, matchId);
        if (!partido) return interaction.reply({ content: 'Error: Partido no encontrado.', flags: [MessageFlags.Ephemeral] });
        
        const modal = new ModalBuilder()
            .setCustomId(`admin_force_result_modal_${matchId}_${tournamentShortId}`)
            .setTitle('Forzar Resultado (Admin)');
        
        const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[0] : '0');
        const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[1] : '0');
        
        modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        
        await interaction.showModal(modal);
        return;
    }

    // --- ACCIONES QUE EDITAN UN MENSAJE (Usan deferUpdate) ---
    if (['user_view_details', 'user_hide_details', 'admin_return_to_main_panel'].some(p => interaction.customId.startsWith(p))) {
        await interaction.deferUpdate();

        if (interaction.customId.startsWith('user_view_details')) {
            const tournamentShortId = params[2];
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) return interaction.editReply({ content: 'Este torneo ya no existe.', components: [] });

            const detailsRow = new ActionRowBuilder();
            // ... (código para añadir botones de link, etc.)
            detailsRow.addComponents(new ButtonBuilder().setCustomId(`user_hide_details_${tournament.shortId}`).setLabel('Volver').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'));
            return interaction.editReply({ components: [detailsRow] });
        }

        if (interaction.customId.startsWith('user_hide_details')) {
            const tournamentShortId = params[2];
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) return interaction.editReply({ content: 'Este torneo ya no existe.', components: [] });

            const originalContent = createTournamentStatusEmbed(tournament);
            return interaction.editReply(originalContent);
        }

        if (interaction.customId.startsWith('admin_return_to_main_panel')) {
            await updateAdminPanel(interaction.message, client);
            return;
        }
    }
    
    // --- ACCIONES QUE DAN UNA NUEVA RESPUESTA EFÍMERA ---
    // (Todas las demás acciones)

    // Para la creación, la respuesta es inmediata, así que usamos reply()
    if (interaction.customId.startsWith('admin_create_tournament_start')) {
        const formatMenu = new StringSelectMenuBuilder().setCustomId('admin_create_format').setPlaceholder('Paso 1: Selecciona el formato del torneo').addOptions(Object.keys(TOURNAMENT_FORMATS).map(key => ({ label: TOURNAMENT_FORMATS[key].label, description: TOURNAMENT_FORMATS[key].description.slice(0, 100), value: key })));
        await interaction.reply({
            content: 'Iniciando creación de torneo...',
            components: [new ActionRowBuilder().addComponents(formatMenu)],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    // Para el resto, asumimos que puede tardar, así que usamos deferReply()
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    
    if (interaction.customId.startsWith('admin_approve')) {
        const [, captainId, tournamentShortId] = interaction.customId.split('_');
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Este torneo ya no existe.');
        
        const teamData = tournament.teams.pendientes[captainId];
        if (!teamData) return interaction.editReply('Este equipo ya no está pendiente o ya fue procesado.');
        
        await approveTeam(client, tournament, teamData);
        
        // Desactivar botones del mensaje original de aprobación
        const originalMessage = interaction.message;
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await originalMessage.edit({ content: originalMessage.content + `\n*Aprobado por ${interaction.user.tag}*`, components: [disabledRow] });
        
        await interaction.editReply(`✅ Equipo **${teamData.nombre}** aprobado para el torneo **${tournament.nombre}**.`);
        
        try {
            const captainUser = await client.users.fetch(captainId);
            await captainUser.send(`¡Felicidades! Tu equipo **${teamData.nombre}** ha sido aprobado para el torneo **${tournament.nombre}**.`);
        } catch (e) { console.warn(`No se pudo enviar DM al capitán ${captainId}`); }
        return;
    }

    if (interaction.customId.startsWith('admin_force_draw')) {
        const tournamentShortId = params[2];
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');
        if (tournament.status !== 'inscripcion_abierta') return interaction.editReply('El sorteo ya se ha realizado.');
        if (Object.keys(tournament.teams.aprobados).length < 2) return interaction.editReply('Se necesitan al menos 2 equipos para forzar el sorteo.');

        await interaction.editReply(`Iniciando sorteo manualmente para **${tournament.nombre}**...`);
        await startGroupStage(client, guild, tournament);
        return;
    }
    
    if (interaction.customId.startsWith('admin_end_tournament')) {
        const tournamentShortId = params[2];
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: No se pudo encontrar ese torneo.' });

        try {
            setBotBusy(true);
            await updateAdminPanel(client); // Actualiza el panel para mostrar el estado ocupado
            await interaction.editReply({ content: `⏳ Finalizando el torneo **${tournament.nombre}**...` });
            await endTournament(client, tournament);
            await interaction.followUp({ content: `✅ Torneo **${tournament.nombre}** finalizado y archivado.` , flags: [MessageFlags.Ephemeral]});
        } catch (e) {
            await interaction.followUp({ content: `❌ Ocurrió un error al finalizar el torneo. Revisa los logs.`, flags: [MessageFlags.Ephemeral] });
            console.error("Error al finalizar torneo:", e);
        } finally {
            setBotBusy(false);
            await updateAdminPanel(client); // Actualiza el panel para mostrar el estado listo
        }
        return;
    }
}
