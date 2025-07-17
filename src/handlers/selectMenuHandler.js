// Reemplazar el contenido de src/handlers/selectMenuHandler.js

import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createTournamentManagementPanel } from '../utils/embeds.js'; // <-- Importamos la nueva función

export async function handleSelectMenu(interaction) {
    const customIdParts = interaction.customId.split('_');
    const action = customIdParts[0];
    const value = interaction.values[0];

    // Flujo de creación de torneo (sin cambios)
    if (action === 'admin' && customIdParts[1] === 'create') {
        // ... (el código existente aquí se mantiene igual)
        if (customIdParts[2] === 'format') { /* ... */ }
        if (customIdParts[2] === 'type') { /* ... */ }
    }
    
    // --- LÓGICA NUEVA PARA GESTIONAR UN TORNEO ---
    if (action === 'admin' && customIdParts[1] === 'manage' && customIdParts[2] === 'select' && customIdParts[3] === 'tournament') {
        await interaction.deferUpdate(); // Acusamos recibo para que no dé error de "interacción desconocida"

        const tournamentShortId = value;
        const db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament) {
            return interaction.followUp({ content: 'Error: No se pudo encontrar ese torneo.', ephemeral: true });
        }

        // Creamos el nuevo panel de gestión
        const managementPanel = createTournamentManagementPanel(tournament);
        
        // Editamos el mensaje original del panel de admin para mostrar el nuevo contenido
        await interaction.message.edit(managementPanel);
    }
}
