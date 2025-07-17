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
        // El usuario seleccionó un formato. Respondemos actualizando el mensaje para mostrar el siguiente paso.
        await interaction.deferUpdate();
        
        const formatId = value;
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_create_type_${formatId}`)
            .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
            .addOptions([{ label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' }]);
            
        await interaction.editReply({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[formatId].label}**. Ahora, selecciona el tipo:`, components: [new ActionRowBuilder().addComponents(typeMenu)] });
        return;
    }
    
    if (customId.startsWith('admin_create_type')) {
        // El usuario seleccionó un tipo. Respondemos mostrando un modal (formulario).
        // showModal() es su propia respuesta y no puede ser precedida por deferUpdate/deferReply.
        
        const formatId = customId.replace('admin_create_type_', '');
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
    
    // --- Flujo de gestión de torneo ---
    if (customId.startsWith('admin_manage_select_tournament')) {
        // El usuario seleccionó un torneo para gestionar. Respondemos actualizando el panel de control.
        await interaction.deferUpdate();
        
        const tournamentShortId = value;
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        // Si el torneo fue borrado mientras el menú estaba abierto, no hacemos nada.
        if (!tournament) return; 
        
        const managementPanel = createTournamentManagementPanel(tournament);
        await interaction.editReply(managementPanel);
        return;
    }
}
