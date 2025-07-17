// src/handlers/selectMenuHandler.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createTournamentManagementPanel } from '../utils/embeds.js';

export async function handleSelectMenu(interaction) {
    const customIdParts = interaction.customId.split('_');
    const action = customIdParts[0];
    const value = interaction.values[0];

    // --- Flujo de creación de torneo ---
    if (action === 'admin' && customIdParts[1] === 'create') {
        if (customIdParts[2] === 'format') {
            const formatId = value;
            const typeMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_create_type_${formatId}`)
                .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
                .addOptions([
                    { label: 'Gratuito', description: 'Inscripción libre y sin coste.', value: 'gratis' },
                    { label: 'De Pago', description: 'Se solicitará un pago para inscribirse.', value: 'pago' },
                ]);
            const row = new ActionRowBuilder().addComponents(typeMenu);
            return interaction.update({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[formatId].label}**. Ahora, selecciona el tipo:`, components: [row] });
        }

        if (customIdParts[2] === 'type') {
            const formatId = customIdParts.slice(3).join('_');
            const type = value;

            const modal = new ModalBuilder()
                .setCustomId(`create_tournament_final`)
                .setTitle('Finalizar Creación de Torneo');
            
            const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
            const formatIdInput = new TextInputBuilder().setCustomId('formatId').setLabel('ID de Formato (No editar)').setStyle(TextInputStyle.Short).setValue(formatId).setRequired(true);
            const typeInput = new TextInputBuilder().setCustomId('type').setLabel('Tipo (No editar)').setStyle(TextInputStyle.Short).setValue(type).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nombreInput),
                new ActionRowBuilder().addComponents(formatIdInput),
                new ActionRowBuilder().addComponents(typeInput)
            );

            if (type === 'pago') {
                const paypalInput = new TextInputBuilder().setCustomId('torneo_paypal').setLabel("Enlace de PayPal.Me").setStyle(TextInputStyle.Short).setRequired(true);
                const prizeInputCampeon = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true);
                const prizeInputFinalista = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Opcional');
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
    if (action === 'admin' && customIdParts[1] === 'manage' && customIdParts[2] === 'select' && customIdParts[3] === 'tournament') {
        await interaction.deferUpdate();
        const tournamentShortId = value;
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.followUp({ content: 'Error: No se pudo encontrar ese torneo.', ephemeral: true });
        const managementPanel = createTournamentManagementPanel(tournament);
        return interaction.message.edit(managementPanel);
    }
}
