// src/handlers/modalHandler.js
import { getDb } from '../../database.js';
import { createNewTournament } from '../logic/tournamentLogic.js';
import { processMatchResult } from '../logic/matchLogic.js';
import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CHANNELS } from '../../config.js';

export async function handleModal(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();

    // --- Flujo de Creación de Torneo ---
    if (customId.startsWith('create_tournament:')) {
        // 1. Ganamos tiempo para la tarea pesada.
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // 2. Recogemos los datos del formulario.
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
            // 3. ESPERAMOS a que la función pesada termine.
            await createNewTournament(client, guild, nombre, shortId, config);
            
            // 4. Si todo fue bien, confirmamos el éxito.
            await interaction.editReply({ content: `✅ ¡Éxito! El torneo **"${nombre}"** ha sido creado y anunciado.` });

        } catch (error) {
            // 5. Si algo falló, lo notificamos.
            console.error("Error capturado por el handler al crear el torneo:", error);
            try {
                await interaction.editReply({ content: `❌ Ocurrió un error al crear el torneo. Revisa los logs de Render para más detalles.` });
            } catch (e) {
                if (e.code === 10062) console.warn("[WARN] La interacción para notificar el error ya había expirado.");
            }
        }
        return;
    }

    // --- Flujo de Inscripción de Equipo ---
    if (customId.startsWith('inscripcion_modal_')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const tournamentShortId = customId.split('_')[2];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament || tournament.status !== 'inscripcion_abierta') {
            return interaction.editReply('Las inscripciones para este torneo no están abiertas.');
        }
        
        const teamName = interaction.fields.getTextInputValue('nombre_equipo_input');
        const allTeamNames = [
            ...Object.values(tournament.teams.aprobados || {}).map(e => e.nombre.toLowerCase()),
            ...Object.values(tournament.teams.pendientes || {}).map(e => e.nombre.toLowerCase())
        ];

        if (allTeamNames.includes(teamName.toLowerCase())) {
            return interaction.editReply('Ya existe un equipo con este nombre en este torneo.');
        }

        const teamData = { 
            id: interaction.user.id, 
            nombre: teamName, 
            capitanId: interaction.user.id, 
            capitanTag: interaction.user.tag, 
            bandera: '🏳️', 
            paypal: null, 
            inscritoEn: new Date() 
        };

        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { [`teams.pendientes.${interaction.user.id}`]: teamData } });
        
        const adminChannel = await client.channels.fetch(CHANNELS.GLOBAL_ADMIN_PANEL);
        const adminEmbed = new EmbedBuilder().setColor('#3498DB').setTitle(`🔔 Nueva Inscripción Pendiente: ${tournament.nombre}`).addFields({ name: 'Equipo', value: teamName, inline: true }, { name: 'Capitán', value: interaction.user.tag, inline: true });
        const adminButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_approve_${interaction.user.id}_${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`admin_reject_${interaction.user.id}_${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );
        
        await adminChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
        await interaction.editReply('✅ ¡Tu inscripción ha sido recibida! Un administrador la revisará pronto.');
        return;
    }

    // --- Flujo de Forzar Resultado (Admin) ---
    if (customId.startsWith('admin_force_result_modal_')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const [, , , , matchId, tournamentShortId] = customId.split('_');
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('❌ Error: El torneo asociado no existe.');

        const golesA = parseInt(interaction.fields.getTextInputValue('goles_a'));
        const golesB = parseInt(interaction.fields.getTextInputValue('goles_b'));

        if (isNaN(golesA) || isNaN(golesB)) {
            return interaction.editReply('❌ Formato de resultado inválido. Usa solo números.');
        }

        const resultString = `${golesA}-${golesB}`;

        try {
            await processMatchResult(client, guild, tournament, matchId, resultString);
            await interaction.editReply('✅ Resultado procesado y estadísticas actualizadas.');
            
            // Notificar en el hilo del partido (opcional pero recomendado)
            const { partido } = findMatch(tournament, matchId);
            if (partido && partido.threadId) {
                const thread = await client.channels.fetch(partido.threadId);
                await thread.send(`✅ Resultado **${resultString}** registrado por un administrador.`);
            }
        } catch (error) {
            console.error(`Error al procesar resultado para ${matchId}:`, error);
            await interaction.editReply(`❌ Hubo un error al procesar el resultado: ${error.message}`);
        }
        return;
    }
}
