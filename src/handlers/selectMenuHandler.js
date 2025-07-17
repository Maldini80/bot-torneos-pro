// src/handlers/selectMenuHandler.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

export async function handleSelectMenu(interaction) {
    const customIdParts = interaction.customId.split('_');
    const action = customIdParts[0];
    const value = interaction.values[0];

    if (action === 'admin' && customIdParts[1] === 'create') {
        if (customIdParts[2] === 'format') {
            const typeMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_create_type_${value}`)
                .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
                .addOptions([ { label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' } ]);
            const row = new ActionRowBuilder().addComponents(typeMenu);
            await interaction.update({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[value].label}**. Ahora, selecciona el tipo:`, components: [row] });
        }

        if (customIdParts[2] === 'type') {
            // --- INICIO DE LA CORRECCIÓN ---
            // El formatId empieza desde la 4ª parte del customId original (`admin_create_type_...`)
            const formatId = customIdParts.slice(3).join('_');
            const type = value;
            // --- FIN DE LA CORRECCIÓN ---

            const modal = new ModalBuilder()
                .setCustomId(`create_tournament_final_${formatId}_${type}`)
                .setTitle('Finalizar Creación de Torneo');
                
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
    
    // Aquí irá la lógica para el menú de gestión de torneos del admin
    if (action === 'admin' && customIdParts[1] === 'manage' && customIdParts[2] === 'select' && customIdParts[3] === 'tournament') {
        // ... Lógica futura ...
        await interaction.update({ content: `Has seleccionado gestionar el torneo ${value}. ¡Funcionalidad en construcción!`, components: [], ephemeral: true });
    }
}
