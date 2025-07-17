// src/handlers/selectMenuHandler.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

export async function handleSelectMenu(interaction) {
    const [action, ...params] = interaction.customId.split('_');
    const value = interaction.values[0];

    if (action === 'admin' && params[0] === 'create') {
        if (params[1] === 'format') {
            const typeMenu = new StringSelectMenuBuilder().setCustomId(`admin_create_type_${value}`).setPlaceholder('Paso 2: Selecciona el tipo de torneo')
                .addOptions([ { label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' } ]);
            const row = new ActionRowBuilder().addComponents(typeMenu);
            await interaction.update({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[value].label}**. Ahora, selecciona el tipo:`, components: [row] });
        }

        if (params[1] === 'type') {
            const formatId = params[2], type = value;
            const modal = new ModalBuilder().setCustomId(`create_tournament_final_${formatId}_${type}`).setTitle('Finalizar Creación de Torneo');
            const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nombreInput));
            if (type === 'pago') {
                const paypalInput = new TextInputBuilder().setCustomId('torneo_paypal').setLabel("Enlace de PayPal.Me").setStyle(TextInputStyle.Short).setRequired(true);
                const prizeInputCampeon = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true);
                const prizeInputFinalista = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Opcional');
                modal.addComponents(new ActionRowBuilder().addComponents(paypalInput), new ActionRowBuilder().addComponents(prizeInputCampeon), new ActionRowBuilder().addComponents(prizeInputFinalista));
            }
            await interaction.showModal(modal);
        }
    }
}
