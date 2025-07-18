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
        // CORRECCIÓN CRÍTICA: Acusamos recibo INMEDIATAMENTE para evitar el error "Interacción fallida".
        await interaction.deferUpdate();
        
        const formatId = value;
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_create_type_${formatId}`)
            .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
            .addOptions([{ label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' }]);
        
        // Ahora que ya hemos acusado recibo, editamos el mensaje con el siguiente paso.
        await interaction.editReply({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[formatId].label}**. Ahora, el tipo:`, components: [new ActionRowBuilder().addComponents(typeMenu)] });
        return;
    }
    
    if (customId.startsWith('admin_create_type')) {
        // Aquí no necesitamos deferUpdate porque mostrar un modal es una respuesta válida e inmediata.
        const formatId = customId.replace('admin_create_type_', '');
        const type = value;
        const modal = new ModalBuilder().setCustomId(`create_tournament:${formatId}:${type}`).setTitle('Finalizar Creación de Torneo');
        const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(nombreInput));

        if (type === 'pago') {
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
    
    // --- Flujo de modificación de torneo ---
    if (customId.startsWith('admin_change_format_select_')) {
        await interaction.deferUpdate();
        const tournamentShortId = customId.split('_').pop();
        const newFormatId = value;
        
        await updateTournamentConfig(interaction.client, tournamentShortId, { formatId: newFormatId });
        
        await interaction.editReply({ content: `✅ Formato actualizado a: **${TOURNAMENT_FORMATS[newFormatId].label}**.`, components: [] });
        return;
    }
    
    if (customId.startsWith('admin_change_type_select_')) {
        const tournamentShortId = customId.split('_').pop();
        const newType = value;
        
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

        } else {
            await interaction.deferUpdate();
            await updateTournamentConfig(interaction.client, tournamentShortId, { isPaid: false, entryFee: 0, prizeCampeon: 0, prizeFinalista: 0 });
            await interaction.editReply({ content: `✅ Torneo actualizado a: **Gratuito**.`, components: [] });
        }
        return;
    }
}
