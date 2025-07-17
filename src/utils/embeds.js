// Añadir esta nueva función al final de src/utils/embeds.js

/**
 * Crea el panel de gestión para un torneo específico.
 * @param {Object} tournament - El torneo seleccionado.
 */
export function createTournamentManagementPanel(tournament) {
    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle(`Gestionando Torneo: ${tournament.nombre}`)
        .setDescription(`**ID:** \`${tournament.shortId}\`\n**Estado:** ${tournament.status.replace(/_/g, ' ')}\n\nSelecciona una acción para este torneo.`)
        .setFooter({ text: 'Estás en el modo de gestión de un torneo específico.' });

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    // Lógica de botones según el estado del torneo
    if (tournament.status === 'inscripcion_abierta') {
        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_force_draw_${tournament.shortId}`)
                .setLabel('Forzar Sorteo')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎲')
                .setDisabled(Object.keys(tournament.teams.aprobados).length < 2) // Deshabilitado si no hay suficientes equipos
        );
        // Botón para ver equipos pendientes
        if (Object.keys(tournament.teams.pendientes).length > 0) {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_view_pending_${tournament.shortId}`)
                    .setLabel(`Ver Pendientes (${Object.keys(tournament.teams.pendientes).length})`)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏳')
            );
        }
    }
    
    // Acciones peligrosas
    row2.addComponents(
        new ButtonBuilder()
            .setCustomId(`admin_end_tournament_${tournament.shortId}`)
            .setLabel('Finalizar Torneo')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🛑'),
        new ButtonBuilder()
            .setCustomId('admin_return_to_main_panel')
            .setLabel('Volver al Panel Principal')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );

    const components = [];
    if (row1.components.length > 0) components.push(row1);
    if (row2.components.length > 0) components.push(row2);
    
    return { embeds: [embed], components };
}
