// src/handlers/modalHandler.js
import { getDb } from '../../database.js';
import { createNewTournament } from '../logic/tournamentLogic.js';
import { processMatchResult } from '../logic/matchLogic.js';
import { updateAdminPanel, updateTournamentChannelName } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

export async function handleModal(interaction) {
    // REGLA DE ORO: Responder inmediatamente.
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();

    // --- Flujo de Creación de Torneo ---
    if (customId.startsWith('create_tournament:')) {
        setBotBusy(true);
        await updateAdminPanel(client);
        
        try {
            const [, formatId, type] = customId.split(':');
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
            
            await createNewTournament(client, guild, nombre, shortId, config);
            await interaction.editReply({ content: `✅ ¡Torneo **${nombre}** creado exitosamente!` });
        } catch (error) {
            console.error('Error CRÍTICO durante la creación del torneo:', error);
            await interaction.editReply({ content: `❌ Hubo un error crítico al crear el torneo. Revisa los logs.` });
        } finally {
            setBotBusy(false);
            await updateAdminPanel(client);
            await updateTournamentChannelName(client);
        }
    }

    // --- Flujo de Inscripción de Equipo ---
    if (customId.startsWith('inscripcion_modal_')) {
        const tournamentShortId = customId.split('_')[2];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || tournament.status !== 'inscripcion_abierta') {
            return interaction.editReply('Las inscripciones para este torneo no están abiertas.');
        }
        
        const teamName = interaction.fields.getTextInputValue('nombre_equipo_input');
        // ... (resto de tu lógica de inscripción, que ahora es segura)
        await interaction.editReply('✅ ¡Tu inscripción ha sido recibida! Un administrador la revisará pronto.');
    }

    // --- Flujo de Reporte de Resultados (Admin) ---
    if (customId.startsWith('admin_force_result_modal_')) {
        const [, , , , matchId, tournamentShortId] = customId.split('_');
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('❌ Error: El torneo asociado no existe.');
        
        // ... (resto de tu lógica para procesar el resultado)
        await processMatchResult(client, guild, tournament, matchId, resultString);
        await interaction.editReply('✅ Resultado procesado y estadísticas actualizadas.');
    }
}
