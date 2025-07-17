// src/handlers/modalHandler.js
import { getDb } from '../../database.js';
import { createNewTournament } from '../logic/tournamentLogic.js';
import { processMatchResult } from '../logic/matchLogic.js';
import { updateAdminPanel, updateTournamentChannelName } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js'; // <-- Importamos MessageFlags

export async function handleModal(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;

    // --- Flujo de Creación de Torneo ---
    if (customId.startsWith('create_tournament:')) {
        // CORRECCIÓN: Usamos flags para la respuesta efímera
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        setBotBusy(true);
        await updateAdminPanel(client);
        await interaction.editReply({ content: '⏳ El bot está ocupado creando el torneo...' });
        
        console.log('[DEBUG] Iniciando proceso de creación de torneo...');

        const parts = customId.split(':');
        const formatId = parts[1];
        const type = parts[2];
        
        const nombre = interaction.fields.getTextInputValue('torneo_nombre');
        const shortId = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        
        const config = { 
            formatId, 
            isPaid: type === 'pago' 
        };
        if (config.isPaid) {
            config.enlacePaypal = interaction.fields.getTextInputValue('torneo_paypal');
            config.prizeCampeon = parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon'));
            config.prizeFinalista = parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista') || '0');
        }

        try {
            console.log(`[DEBUG] Llamando a createNewTournament para "${nombre}"...`);
            await createNewTournament(client, guild, nombre, shortId, config);
            console.log(`[DEBUG] createNewTournament finalizó exitosamente.`);
            
            // CORRECCIÓN: Usamos followUp para la respuesta final efímera
            await interaction.followUp({ content: `✅ ¡Torneo **${nombre}** creado exitosamente!`, flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            console.error('Error CRÍTICO durante la creación del torneo:', error);
            await interaction.followUp({ content: `❌ Hubo un error crítico al crear el torneo. Revisa los logs de Render para más detalles.`, flags: [MessageFlags.Ephemeral] });
        } finally {
            console.log('[DEBUG] Bloque finally alcanzado. Reseteando estado del bot.');
            setBotBusy(false);
            await updateAdminPanel(client);
            await updateTournamentChannelName(client);
        }
    }

    // --- Flujo de Inscripción de Equipo ---
    if (customId.startsWith('inscripcion_modal_')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        // ... (el resto del código de inscripción es probablemente correcto)
    }

    // --- Flujo de Reporte de Resultados (Admin) ---
    if (customId.startsWith('admin_force_result_modal_')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        // ... (el resto del código de reporte de resultados es probablemente correcto)
    }
}
