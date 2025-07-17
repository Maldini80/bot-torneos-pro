// src/handlers/selectMenuHandler.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createTournamentManagementPanel } from '../utils/embeds.js';

export async function handleSelectMenu(interaction) {
    const customId = interaction.customId;
    const value = interaction.values[0];

    // --- Flujo de creación de torneo ---

    if (customId.startsWith('admin_create_format')) {
        await interaction.deferUpdate();
        const formatId = value;
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_create_type_${formatId}`)
            .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
            .addOptions([{ label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' }]);
        await interaction.editReply({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[formatId].label}**. Ahora, el tipo:`, components: [new ActionRowBuilder().addComponents(typeMenu)] });
        return;
    }
    
    if (customId.startsWith('admin_create_type')) {
        const formatId = customId.replace('admin_create_type_', '');
        const type = value;
        const modal = new ModalBuilder().setCustomId(`create_tournament:${formatId}:${type}`).setTitle('Finalizar Creación de Torneo');
        const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(nombreInput));

        if (type === 'pago') {
            // ¡¡¡CORRECCIÓN AQUÍ!!! Etiquetas acortadas.
            const entryFeeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Inscripción / Entry Fee (€)").setStyle(TextInputStyle.Short).setRequired(true);
            const prizeInputCampeon = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón / Champion Prize (€)").setStyle(TextInputStyle.Short).setRequired(true);
            const prizeInputFinalista = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista / Runner-up Prize (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('0');
            const paypalInput = new TextInputBuilder().setCustomId('torneo_paypal').setLabel("Tu PayPal para recibir pagos").setStyle(TextInputStyle.Short).setRequired(true);
            
            modal.setTitle('Finalizar Creación (De Pago)');
            modal.addComponents(
                new ActionRowBuilder().addComponents(entryFeeInput),
                new ActionRowBuilder().addComponents(prizeInputCampeon),
                new ActionRowBuilder().addComponents(prizeInputFinalista),
                new ActionRowBuilder().addComponents(paypalInput)
            );
        }
        await interaction.showModal(modal);
        return;
    }
    
    // --- Flujo de gestión de torneo ---
    if (customId.startsWith('admin_manage_select_tournament')) {
        await interaction.deferUpdate();
        const tournamentShortId = value;
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return;
        const managementPanel = createTournamentManagementPanel(tournament);
        await interaction.editReply(managementPanel);
        return;
    }
}
