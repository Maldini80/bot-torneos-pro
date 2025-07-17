// src/utils/embeds.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { TOURNAMENT_STATUS_ICONS, CHANNELS } from '../../config.js';

// CORRECCIÓN: Nos aseguramos de que cada función es exportada
export function createGlobalAdminPanel(tournaments = [], isBusy = false) {
    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#2c3e50')
        .setTitle('Panel de Control Global de Torneos')
        .setFooter({ text: 'Bot de Torneos v2.0' });

    if (isBusy) {
        embed.setDescription('🔴 **ESTADO: OCUPADO**\nEl bot está realizando una tarea crítica. La mayoría de las acciones están deshabilitadas temporalmente.');
    } else {
        embed.setDescription('✅ **ESTADO: LISTO**\nUsa los botones de abajo para gestionar todos los torneos del servidor.');
    }

    if (tournaments.length > 0) {
        let tournamentList = tournaments.map(t =>
            `**${t.nombre}** [${t.shortId}]\n*Estado: ${t.status.replace(/_/g, ' ')}*`
        ).join('\n\n');
        embed.addFields({ name: 'Torneos Activos', value: tournamentList });
    } else {
        embed.addFields({ name: 'Torneos Activos', value: 'No hay torneos activos en este momento.' });
    }

    const globalActionsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_create_tournament_start').setLabel('Crear Nuevo Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆').setDisabled(isBusy),
        new ButtonBuilder().setCustomId('admin_force_reset_bot').setLabel('Reset Forzado').setStyle(ButtonStyle.Danger).setEmoji('🚨')
    );

    const components = [globalActionsRow];
    
    if (tournaments.length > 0 && !isBusy) {
        const tournamentManagementMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_manage_select_tournament')
            .setPlaceholder('Selecciona un torneo para gestionar...')
            .addOptions(
                tournaments.map(t => ({
                    label: t.nombre.slice(0, 100),
                    description: `ID: ${t.shortId} | Estado: ${t.status}`.slice(0, 100),
                    value: t.shortId,
                }))
            );
        const managementRow = new ActionRowBuilder().addComponents(tournamentManagementMenu);
        components.push(managementRow);
    }

    return { embeds: [embed], components: components };
}

export function createTournamentStatusEmbed(tournament) {
    const statusIcon = TOURNAMENT_STATUS_ICONS[tournament.status] || '❓';
    const format = tournament.config.format;
    const teamsCount = Object.keys(tournament.teams.aprobados).length;
    const embed = new EmbedBuilder()
        .setColor(tournament.status === 'inscripcion_abierta' ? '#2ecc71' : '#3498db')
        .setTitle(`${statusIcon} ${tournament.nombre}`)
        .setDescription(format.description)
        .addFields(
            { name: 'Formato', value: format.label, inline: true },
            { name: 'Equipos', value: `${teamsCount} / ${format.size}`, inline: true },
            { name: 'Estado Actual', value: tournament.status.replace(/_/g, ' '), inline: true }
        )
        .setFooter({ text: `ID del Torneo: ${tournament.shortId}` });
    const row = new ActionRowBuilder();
    if (tournament.status === 'inscripcion_abierta' && teamsCount < format.size) {
        row.addComponents(new ButtonBuilder().setCustomId(`inscribir_equipo_start_${tournament.shortId}`).setLabel('Inscribirme').setStyle(ButtonStyle.Success).setEmoji('📝'));
    }
    if (tournament.status !== 'cancelado') {
        row.addComponents(new ButtonBuilder().setCustomId(`user_view_details_${tournament.shortId}`).setLabel('Ver Detalles').setStyle(ButtonStyle.Secondary).setEmoji('ℹ️'));
    }
    if (tournament.status === 'finalizado') embed.setColor('#95a5a6').setTitle(`${TOURNAMENT_STATUS_ICONS.finalizado} ${tournament.nombre} (Finalizado)`);
    if (tournament.status === 'inscripcion_abierta' && teamsCount >= format.size) embed.setColor('#e67e22').setTitle(`${TOURNAMENT_STATUS_ICONS.cupo_lleno} ${tournament.nombre} (Cupo Lleno)`);
    return { embeds: [embed], components: row.components.length > 0 ? [row] : [] };
}

export function createTeamListEmbed(tournament) {
    const approvedTeams = Object.values(tournament.teams.aprobados);
    const format = tournament.config.format;
    let description = '🇪🇸 Aún no hay equipos inscritos. ¡Sé el primero!\n🇬🇧 No teams have registered yet. Be the first!';
    if (approvedTeams.length > 0) {
        description = approvedTeams.map((team, index) => `${index + 1}. ${team.bandera || '🏳️'} **${team.nombre}** (Capitán: ${team.capitanTag})`).join('\n');
    }
    const embed = new EmbedBuilder()
        .setColor('#1abc9c')
        .setTitle(`📋 Equipos Inscritos / Registered Teams - ${tournament.nombre}`)
        .setDescription(description)
        .setFooter({ text: `Total: ${approvedTeams.length} / ${format.size}` });
    return { embeds: [embed] };
}

export function createClassificationEmbed(tournament) {
    const embed = new EmbedBuilder()
        .setColor('#1abc9c')
        .setTitle(`📊 Clasificación / Ranking - ${tournament.nombre}`)
        .setTimestamp().setFooter({ text: `ID del Torneo: ${tournament.shortId}`});
    if (Object.keys(tournament.structure.grupos).length === 0) {
        embed.setDescription('🇪🇸 La clasificación se mostrará aquí una vez que comience el torneo.\n🇬🇧 The ranking will be displayed here once the tournament starts.');
        return { embeds: [embed] };
    }
    const sortTeams = (a, b) => {
        if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
        if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
        if (a.stats.gf !== b.stats.gf) return b.stats.gf - a.stats.gf;
        return 0;
    };
    const sortedGroups = Object.keys(tournament.structure.grupos).sort();
    for (const groupName of sortedGroups) {
        const grupo = tournament.structure.grupos[groupName];
        const equiposOrdenados = [...grupo.equipos].sort(sortTeams);
        const nameWidth = 16, header = "EQUIPO/TEAM".padEnd(nameWidth) + "PJ  PTS  GF  GC   DG";
        const table = equiposOrdenados.map(e => {
            const teamName = e.nombre.slice(0, nameWidth - 1).padEnd(nameWidth);
            const pj = e.stats.pj.toString().padStart(2);
            const pts = e.stats.pts.toString().padStart(3);
            const gf = e.stats.gf.toString().padStart(3);
            const gc = e.stats.gc.toString().padStart(3);
            const dgVal = e.stats.dg;
            const dg = (dgVal >= 0 ? '+' : '') + dgVal.toString();
            const paddedDg = dg.padStart(4);
            return `${teamName}${pj}  ${pts}  ${gf}  ${gc}  ${paddedDg}`;
        }).join('\n');
        embed.addFields({ name: `**${groupName}**`, value: "```\n" + header + "\n" + table + "\n```" });
    }
    return { embeds: [embed] };
}

export function createCalendarEmbed(tournament) {
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle(`🗓️ Calendario / Schedule - ${tournament.nombre}`)
        .setTimestamp().setFooter({ text: `ID del Torneo: ${tournament.shortId}`});
    if (Object.keys(tournament.structure.calendario).length === 0) {
        embed.setDescription('🇪🇸 El calendario de partidos se mostrará aquí.\n🇬🇧 The match schedule will be displayed here.');
        return { embeds: [embed] };
    }
    const sortedGroups = Object.keys(tournament.structure.calendario).sort();
    for (const groupName of sortedGroups) {
        const partidosDelGrupo = tournament.structure.calendario[groupName];
        const partidosPorJornada = {};
        for (const partido of partidosDelGrupo) {
            if (!partidosPorJornada[partido.jornada]) partidosPorJornada[partido.jornada] = [];
            partidosPorJornada[partido.jornada].push(partido);
        }
        let groupScheduleText = '';
        const nameWidth = 15, centerWidth = 6;
        for (const jornadaNum of Object.keys(partidosPorJornada).sort((a, b) => a - b)) {
            groupScheduleText += `Jornada / Round ${jornadaNum}\n`;
            for (const partido of partidosPorJornada[jornadaNum]) {
                const centerText = partido.resultado ? partido.resultado : 'vs';
                const paddingTotal = centerWidth - centerText.length;
                const paddingInicio = Math.ceil(paddingTotal / 2), paddingFin = Math.floor(paddingTotal / 2);
                const paddedCenter = ' '.repeat(paddingInicio) + centerText + ' '.repeat(paddingFin);
                const equipoA = partido.equipoA.nombre.slice(0, nameWidth).padEnd(nameWidth);
                const equipoB = partido.equipoB.nombre.slice(0, nameWidth).padStart(nameWidth);
                groupScheduleText += `${equipoA}${paddedCenter}${equipoB}\n`;
            }
        }
        embed.addFields({ name: `**${groupName}**`, value: `\`\`\`\n${groupScheduleText.trim()}\n\`\`\``, inline: true });
    }
    return { embeds: [embed] };
}

// Y la función que nos faltaba por exportar
export function createTournamentManagementPanel(tournament) {
    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle(`Gestionando Torneo: ${tournament.nombre}`)
        .setDescription(`**ID:** \`${tournament.shortId}\`\n**Estado:** ${tournament.status.replace(/_/g, ' ')}\n\nSelecciona una acción para este torneo.`)
        .setFooter({ text: 'Estás en el modo de gestión de un torneo específico.' });
    const row1 = new ActionRowBuilder(), row2 = new ActionRowBuilder();
    if (tournament.status === 'inscripcion_abierta') {
        row1.addComponents(new ButtonBuilder().setCustomId(`admin_force_draw_${tournament.shortId}`).setLabel('Forzar Sorteo').setStyle(ButtonStyle.Primary).setEmoji('🎲').setDisabled(Object.keys(tournament.teams.aprobados).length < 2));
        if (Object.keys(tournament.teams.pendientes).length > 0) {
            row1.addComponents(new ButtonBuilder().setCustomId(`admin_view_pending_${tournament.shortId}`).setLabel(`Ver Pendientes (${Object.keys(tournament.teams.pendientes).length})`).setStyle(ButtonStyle.Secondary).setEmoji('⏳'));
        }
    }
    row2.addComponents(
        new ButtonBuilder().setCustomId(`admin_end_tournament_${tournament.shortId}`).setLabel('Finalizar Torneo').setStyle(ButtonStyle.Danger).setEmoji('🛑'),
        new ButtonBuilder().setCustomId(`admin_return_to_main_panel`).setLabel('Volver al Panel Principal').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
    );
    const components = [];
    if (row1.components.length > 0) components.push(row1);
    if (row2.components.length > 0) components.push(row2);
    return { embeds: [embed], components };
}
