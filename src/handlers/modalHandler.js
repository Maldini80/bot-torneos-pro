// src/handlers/modalHandler.js
import { getDb } from '../../database.js';
import { createNewTournament } from '../logic/tournamentLogic.js';
import { processMatchResult } from '../logic/matchLogic.js';
import { MessageFlags } from 'discord.js';

export async function handleModal(interaction) {
    const customId = interaction.customId;

    // --- Flujo de Creación de Torneo (Lógica Corregida y Robusta) ---
    if (customId.startsWith('create_tournament:')) {
        // 1. Respondemos inmediatamente que hemos recibido la orden.
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // 2. Recogemos los datos.
        const client = interaction.client;
        const guild = interaction.guild;
        const [, formatId, type] = customId.split(':');
        const nombre = interaction.fields.getTextInputValue('torneo_nombre');
        const shortId = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const config = { formatId, isPaid: type === 'pago' };
        if (config.isPaid) {
            config.enlacePaypal = interaction.fields.getTextInputValue('torneo_paypal');
            config.prizeCampeon = parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon'));
            config.prizeFinalista = parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista') || '0');
        }

        try {
            // 3. ESPERAMOS (await) a que la función pesada termine.
            await createNewTournament(client, guild, nombre, shortId, config);
            
            // 4. Si todo fue bien, editamos la respuesta para confirmar el éxito.
            await interaction.editReply({ content: `✅ ¡Éxito! El torneo **"${nombre}"** ha sido creado y anunciado.` });

        } catch (error) {
            // 5. Si createNewTournament lanzó un error, lo capturamos aquí.
            console.error("Error capturado por el handler al crear el torneo:", error);
            
            // Intentamos notificar al admin del error.
            try {
                await interaction.editReply({ content: `❌ Ocurrió un error al crear el torneo. Revisa los logs de Render para más detalles.` });
            } catch (e) {
                // Si la interacción ya expiró, no podemos hacer nada más, pero el error principal ya está en los logs.
                if (e.code === 10062) {
                    console.warn("[WARN] La interacción para notificar el error ya había expirado.");
                }
            }
        }
        return;
    }

    // --- El resto de los handlers pueden seguir usando deferReply al principio ---
    // ... tu lógica para 'inscripcion_modal_' y 'admin_force_result_modal_' ...
}
