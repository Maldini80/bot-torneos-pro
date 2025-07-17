// src/handlers/selectMenuHandler.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createTournamentManagementPanel } from '../utils/embeds.js';

export async function handleSelectMenu(interaction) {
    const customId = interaction.customId;
    const value = interaction.values[0];

    // --- Flujo de creación de torneo ---
    if (customId.startsWith('admin_create_')) {
        const parts = customId.split('_');
        
        if (parts[2] === 'format') {
            const formatId = value;
            const typeMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_create_type_${formatId}`)
                .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
                .addOptions([
                    { label: 'Gratuito', description: 'Inscripción libre.', value: 'gratis' },
                    { label: 'De Pago', description: 'Se solicitará un pago.', value: 'pago' },
                ]);
            const row = new ActionRowBuilder().addComponents(typeMenu);
            return interaction.update({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[formatId].label}**. Ahora, selecciona el tipo:`, components: [row] });
        }

        if (parts[2] === 'type') {
            const formatId = parts.slice(3).join('_');
            const type = value;

            // --- NUEVA LÓGICA DE CUSTOM ID ---
            const modal = new ModalBuilder()
                .setCustomId(`create_tournament:${formatId}:${type}`) // Usamos ':' como separador
                .setTitle('Finalizar Creación de Torneo');
            
            const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nombreInput));

            if (type === 'pago') {
                const paypalInput = new TextInputBuilder().setCustomId('torneo_paypal').setLabel("Enlace de PayPal.Me").setStyle(TextInputStyle.Short).setRequired(true);
                const prizeInputCampeon = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true);
                const prizeInputFinalista = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(false);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(paypalInput),
                    new ActionRowBuilder().addComponents(prizeInputCampeon),
                    new ActionRowBuilder().addComponents(prizeInputFinalista)
                );
            }
            return interaction.showModal(modal);
        }
    }
    
    // --- Flujo de gestión de torneo ---
    if (customId.startsWith('admin_manage_select_tournament')) {
        await interaction.deferUpdate();
        const tournamentShortId = value;
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.followUp({ content: 'Error: No se pudo encontrar ese torneo.', ephemeral: true });
        const managementPanel = createTournamentManagementPanel(tournament);
        return interaction.message.edit(managementPanel);
    }
}
