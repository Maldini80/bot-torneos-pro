// src/handlers/selectMenuHandler.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { updateTournamentConfig } from '../logic/tournamentLogic.js';

export async function handleSelectMenu(interaction) {
    const customId = interaction.customId;
    const value = interaction.values[0];

    // --- Flujo de creación de torneo ---
    if (customId.startsWith('admin_create_format')) {
        // ... (Sin cambios)
    }
    
    if (customId.startsWith('admin_create_type')) {
        // ... (Sin cambios)
    }
    
    // NUEVO: Handlers para cambiar formato y tipo de un torneo existente
    if (customId.startsWith('admin_change_format_select_')) {
        await interaction.deferUpdate();
        const tournamentShortId = customId.split('_').pop();
        const newFormatId = value;
        
        await updateTournamentConfig(interaction.client, tournamentShortId, { formatId: newFormatId });
        
        await interaction.editReply({ content: `✅ Formato actualizado a: **${TOURNAMENT_FORMATS[newFormatId].label}**.`, components: [] });
        return;
    }
    
    if (customId.startsWith('admin_change_type_select_')) {
        await interaction.deferUpdate();
        const tournamentShortId = customId.split('_').pop();
        const newType = value;
        
        // Si se cambia a 'pago', necesitamos pedir más datos.
        if (newType === 'pago') {
            const modal = new ModalBuilder()
                .setCustomId(`edit_payment_details_modal_${tournamentShortId}`)
                .setTitle('Detalles del Torneo de Pago');
            
            const feeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Cuota de Inscripción (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('5');
            const prizeCInput = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('40');
            const prizeFInput = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('0');
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(feeInput),
                new ActionRowBuilder().addComponents(prizeCInput),
                new ActionRowBuilder().addComponents(prizeFInput)
            );
            await interaction.showModal(modal);

        } else { // Si se cambia a gratuito, reseteamos valores.
            await updateTournamentConfig(interaction.client, tournamentShortId, { isPaid: false, entryFee: 0, prizeCampeon: 0, prizeFinalista: 0 });
            await interaction.editReply({ content: `✅ Torneo actualizado a: **Gratuito**.`, components: [] });
        }
        return;
    }
}
