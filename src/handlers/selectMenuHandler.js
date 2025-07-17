// src/handlers/selectMenuHandler.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createTournamentManagementPanel } from '../utils/embeds.js';

export async function handleSelectMenu(interaction) {
    const customId = interaction.customId;
    const value = interaction.values[0];

    // Caso especial: abrir un modal no se puede hacer después de un deferUpdate.
    if (customId.startsWith('admin_create_type')) {
        const formatId = customId.split('_').pop();
        const type = value;
        const modal = new ModalBuilder().setCustomId(`create_tournament:${formatId}:${type}`).setTitle('Finalizar Creación');
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
        await interaction.showModal(modal);
        return;
    }

    // Para el resto de menús, actualizamos el mensaje.
    await interaction.deferUpdate();

    if (customId.startsWith('admin_create_format')) {
        const formatId = value;
        const typeMenu = new StringSelectMenuBuilder().setCustomId(`admin_create_type_${formatId}`).setPlaceholder('Paso 2: Selecciona el tipo de torneo').addOptions([{ label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' }]);
        await interaction.editReply({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[formatId].label}**. Ahora, selecciona el tipo:`, components: [new ActionRowBuilder().addComponents(typeMenu)] });
    }
    
    if (customId.startsWith('admin_manage_select_tournament')) {
        const tournamentShortId = value;
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: No se pudo encontrar ese torneo.', components: [] });
        const managementPanel = createTournamentManagementPanel(tournament);
        await interaction.editReply(managementPanel);
    }
}
