// src/handlers/buttonHandler.js
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS } from '../../config.js';
import { approveTeam, endTournament } from '../logic/tournamentLogic.js'; // <-- Importamos endTournament
import { createTournamentStatusEmbed } from '../utils/embeds.js';
import { setBotBusy } from '../../index.js';
import { updateAdminPanel } from '../utils/panelManager.js';

export async function handleButton(interaction) {
    const [action, ...params] = interaction.customId.split('_');
    const client = interaction.client;

    if (!interaction.customId.startsWith('inscribir_equipo_start')) {
        await interaction.deferReply({ ephemeral: true });
    }

    // --- ACCIONES DE USUARIO ---
    if (action === 'user') {
        if (params[0] === 'view' && params[1] === 'details') {
            const tournamentShortId = params[2];
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) return interaction.editReply({ content: 'Este torneo ya no existe.', ephemeral: true });

            const detailsRow = new ActionRowBuilder();
            if (tournament.discordMessageIds.teamListMessageId) detailsRow.addComponents(new ButtonBuilder().setLabel('Lista de Equipos').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${tournament.guildId}/${CHANNELS.CAPITANES_INSCRITOS}/${tournament.discordMessageIds.teamListMessageId}`));
            if (tournament.status !== 'inscripcion_abierta' && tournament.discordMessageIds.classificationMessageId) detailsRow.addComponents(new ButtonBuilder().setLabel('Clasificación').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${tournament.guildId}/${CHANNELS.CLASIFICACION}/${tournament.discordMessageIds.classificationMessageId}`));
            if (tournament.status !== 'inscripcion_abierta' && tournament.discordMessageIds.calendarMessageId) detailsRow.addComponents(new ButtonBuilder().setLabel('Calendario').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${tournament.guildId}/${CHANNELS.CALENDARIO}/${tournament.discordMessageIds.calendarMessageId}`));
            detailsRow.addComponents(new ButtonBuilder().setCustomId(`user_hide_details_${tournament.shortId}`).setLabel('Volver').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'));
            
            await interaction.message.edit({ components: [detailsRow] });
            return interaction.editReply({ content: 'Mostrando detalles del torneo.', ephemeral: true });
        }

        if (params[0] === 'hide' && params[1] === 'details') {
            const tournamentShortId = params[2];
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) return interaction.editReply({ content: 'Este torneo ya no existe.', ephemeral: true });
            
            const originalContent = createTournamentStatusEmbed(tournament);
            await interaction.message.edit(originalContent);
            return interaction.editReply({ content: 'Detalles ocultos.', ephemeral: true });
        }
    }
    
    if (action === 'inscribir' && params[0] === 'equipo' && params[1] === 'start') {
        const tournamentShortId = params[2];
        const modal = new ModalBuilder().setCustomId(`inscripcion_modal_${tournamentShortId}`).setTitle('Inscripción de Equipo');
        const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (3-15 caracteres)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(15).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput));
        return interaction.showModal(modal);
    }
    
    // --- ACCIONES DE ADMINISTRADOR ---
    if (action === 'admin') {
        if (params[0] === 'create' && params[1] === 'tournament' && params[2] === 'start') {
            const formatMenu = new StringSelectMenuBuilder().setCustomId('admin_create_format').setPlaceholder('Paso 1: Selecciona el formato del torneo')
                .addOptions(Object.keys(TOURNAMENT_FORMATS).map(key => ({
                    label: TOURNAMENT_FORMATS[key].label,
                    description: TOURNAMENT_FORMATS[key].description.slice(0, 100),
                    value: key,
                })));
            const row = new ActionRowBuilder().addComponents(formatMenu);
            return interaction.editReply({ content: 'Iniciando creación de torneo...', components: [row], ephemeral: true });
        }
        
        if (params[0] === 'approve') {
            const captainId = params[1], tournamentShortId = params[2], db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) return interaction.editReply('Este torneo ya no existe.');
            const teamData = tournament.teams.pendientes[captainId];
            if (!teamData) return interaction.editReply('Este equipo ya no está pendiente o ya fue procesado.');
            await approveTeam(client, tournament, teamData);
            const originalMessage = interaction.message;
            const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
            disabledRow.components.forEach(c => c.setDisabled(true));
            await originalMessage.edit({ content: originalMessage.content + `\n*Aprobado por ${interaction.user.tag}*`, components: [disabledRow] });
            await interaction.editReply(`✅ Equipo **${teamData.nombre}** aprobado para el torneo **${tournament.nombre}**.`);
            try {
                const captainUser = await client.users.fetch(captainId);
                await captainUser.send(`¡Felicidades! Tu equipo **${teamData.nombre}** ha sido aprobado para el torneo **${tournament.nombre}**.`);
            } catch (e) { console.warn(`No se pudo enviar DM al capitán ${captainId}`); }
        }

        if (params[0] === 'force' && params[1] === 'reset' && params[2] === 'bot') {
            await interaction.editReply({ content: '🚨 Recibido. Forzando el estado del bot a "Listo"...', ephemeral: true });
            setBotBusy(false);
            await updateAdminPanel(client);
            await interaction.followUp({ content: '✅ El bot ha sido reseteado al estado "Listo". Los botones del panel están activos.', ephemeral: true });
        }

        // --- LÓGICA NUEVA PARA LOS BOTONES DE GESTIÓN ---
        if (params[0] === 'return' && params[1] === 'to' && params[2] === 'main' && params[3] === 'panel') {
            await interaction.deferUpdate();
            await updateAdminPanel(client);
        }

        if (params[0] === 'end' && params[1] === 'tournament') {
            const tournamentShortId = params[2];
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) return interaction.editReply({ content: 'Error: No se pudo encontrar ese torneo.', ephemeral: true });

            setBotBusy(true);
            await updateAdminPanel(client);
            await interaction.editReply({ content: `⏳ Finalizando el torneo **${tournament.nombre}**...`, ephemeral: true });

            try {
                await endTournament(client, tournament);
                await interaction.followUp({ content: `✅ Torneo **${tournament.nombre}** finalizado y archivado.`, ephemeral: true });
            } catch (e) {
                await interaction.followUp({ content: `❌ Ocurrió un error al finalizar el torneo. Revisa los logs.`, ephemeral: true });
                console.error("Error al finalizar torneo:", e);
            } finally {
                setBotBusy(false);
                // Volvemos al panel principal después de la acción
                await updateAdminPanel(client);
            }
        }
        
        if (params[0] === 'view' && params[1] === 'pending') {
            const tournamentShortId = params[2];
            const db = getDb();
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
             if (!tournament) return interaction.editReply({ content: 'Error: No se pudo encontrar ese torneo.', ephemeral: true });

            const pendingTeams = Object.values(tournament.teams.pendientes);
            if (pendingTeams.length === 0) {
                return interaction.editReply({ content: 'No hay equipos pendientes de aprobación para este torneo.', ephemeral: true });
            }

            const teamList = pendingTeams.map((team, index) => 
                `${index + 1}. **${team.nombre}** (Capitán: ${team.capitanTag})`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setTitle(`⏳ Equipos Pendientes - ${tournament.nombre}`)
                .setDescription(teamList)
                .setColor('#e67e22');
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
        }
    }
}
