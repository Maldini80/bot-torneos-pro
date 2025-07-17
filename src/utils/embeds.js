// src/utils/embeds.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { TOURNAMENT_STATUS_ICONS, TOURNAMENT_FORMATS } from '../../config.js';

export function createGlobalAdminPanel(tournaments = [], isBusy = false) {
    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#2c3e50')
        .setTitle('Panel de Control Global de Torneos')
        .setFooter({ text: 'Bot de Torneos v2.2' });
    embed.setDescription(isBusy ? '🔴 **ESTADO: OCUPADO**\nEl bot está realizando una tarea crítica.' : '✅ **ESTADO: LISTO**\nUsa los botones de abajo para gestionar los torneos.');
    if (tournaments.length > 0) {
        embed.addFields({ name: 'Torneos Activos', value: tournaments.map(t => `**${t.nombre}** [${t.shortId}] | *Estado: ${t.status.replace(/_/g, ' ')}*`).join('\n') });
    } else {
        embed.addFields({ name: 'Torneos Activos', value: 'No hay torneos activos en este momento.' });
    }
    const globalActionsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_create_tournament_start').setLabel('Crear Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆').setDisabled(isBusy),
        new ButtonBuilder().setCustomId('admin_force_reset_bot').setLabel('Reset Forzado').setStyle(ButtonStyle.Danger).setEmoji('🚨')
    );
    const components = [globalActionsRow];
    if (tournaments.length > 0 && !isBusy) {
        const tournamentManagementMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_manage_select_tournament')
            .setPlaceholder('Selecciona un torneo para gestionar...')
            .addOptions(tournaments.map(t => ({
                label: t.nombre.slice(0, 100),
                description: `ID: ${t.shortId} | Estado: ${t.status}`.slice(0, 100),
                value: t.shortId,
            })));
        components.push(new ActionRowBuilder().addComponents(tournamentManagementMenu));
    }
    return { embeds: [embed], components };
}

export function createTournamentStatusEmbed(tournament) {
    const statusIcon = TOURNAMENT_STATUS_ICONS[tournament.status] || '❓';
    const format = tournament.config.format;
    const teamsCount = Object.keys(tournament.teams.aprobados).length;
    
    const embed = new EmbedBuilder()
        .setColor(tournament.status === 'inscripcion_abierta' ? '#2ecc71' : '#3498db')
        .setTitle(`${statusIcon} ${tournament.nombre}`)
        .addFields(
            { name: 'Formato / Format', value: format.label, inline: true },
            { name: 'Equipos / Teams', value: `${teamsCount} / ${format.size}`, inline: true }
        )
        .setFooter({ text: `ID del Torneo: ${tournament.shortId}` });

    // Lógica para la descripción y el precio
    const formatDescriptionES = TOURNAMENT_FORMATS[tournament.config.formatId].description;
    const formatDescriptionEN = TOURNAMENT_FORMATS[tournament.config.formatId].description; // Idealmente, tendrías descripciones bilingües en tu config.js

    if (tournament.config.isPaid) {
        embed.setDescription(`**Este es un torneo de pago. / This is a paid tournament.**\n🇪🇸 ${formatDescriptionES}\n🇬🇧 ${formatDescriptionEN}`);
        embed.addFields({ name: 'Inscripción / Entry Fee', value: `${tournament.config.entryFee}€`, inline: true });
    } else {
        embed.setDescription(`**Este es un torneo gratuito. / This is a free tournament.**\n🇪🇸 ${formatDescriptionES}\n🇬🇧 ${formatDescriptionEN}`);
        embed.addFields({ name: 'Inscripción / Entry Fee', value: 'Gratuito / Free', inline: true });
    }
    
    const row = new ActionRowBuilder();
    if (tournament.status === 'inscripcion_abierta' && teamsCount < format.size) {
        const buttonLabel = tournament.config.isPaid ? 'Inscribirme (Pago Requerido)' : 'Inscribirme / Register';
        row.addComponents(new ButtonBuilder().setCustomId(`inscribir_equipo_start_${tournament.shortId}`).setLabel(buttonLabel).setStyle(ButtonStyle.Success).setEmoji('📝'));
    }
    
    row.addComponents(new ButtonBuilder().setCustomId(`user_view_details_${tournament.shortId}`).setLabel('Ver Detalles / View Details').setStyle(ButtonStyle.Secondary).setEmoji('ℹ️'));
    
    if (tournament.status === 'finalizado') embed.setColor('#95a5a6').setTitle(`${TOURNAMENT_STATUS_ICONS.finalizado} ${tournament.nombre} (Finalizado / Finished)`);
    if (tournament.status === 'inscripcion_abierta' && teamsCount >= format.size) embed.setColor('#e67e22').setTitle(`${TOURNAMENT_STATUS_ICONS.cupo_lleno} ${tournament.nombre} (Cupo Lleno / Full)`);

    return { embeds: [embed], components: [row] };
}

export function createTeamListEmbed(tournament) {
    const approvedTeams = Object.values(tournament.teams.aprobados);
    const format = tournament.config.format;
    let description = '🇪🇸 Aún no hay equipos inscritos.\n🇬🇧 No teams have registered yet.';
    if (approvedTeams.length > 0) {
        description = approvedTeams.map((team, index) => `${index + 1}. ${team.bandera || '🏳️'} **${team.nombre}** (Cap: ${team.capitanTag})`).join('\n');
    }
    const embed = new EmbedBuilder().setColor('#1abc9c').setTitle(`📋 Equipos Inscritos - ${tournament.nombre}`).setDescription(description).setFooter({ text: `Total: ${approvedTeams.length} / ${format.size}` });
    return { embeds: [embed] };
}

export function createTournamentManagementPanel(tournament) {
    const embed = new EmbedBuilder().setColor('#e67e22').setTitle(`Gestionando: ${tournament.nombre}`).setDescription(`**ID:** \`${tournament.shortId}\`\n**Estado:** ${tournament.status.replace(/_/g, ' ')}`).setFooter({ text: 'Estás en el modo de gestión de un torneo específico.' });
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    row1.addComponents(new ButtonBuilder().setCustomId(`admin_add_test_teams_${tournament.shortId}`).setLabel('Añadir Equipos Test').setStyle(ButtonStyle.Secondary).setEmoji('🧪'));
    if (tournament.status === 'inscripcion_abierta') {
        row1.addComponents(new ButtonBuilder().setCustomId(`admin_force_draw_${tournament.shortId}`).setLabel('Forzar Sorteo').setStyle(ButtonStyle.Primary).setEmoji('🎲').setDisabled(Object.keys(tournament.teams.aprobados).length < 2));
    }
    row2.addComponents(new ButtonBuilder().setCustomId(`admin_end_tournament_${tournament.shortId}`).setLabel('Finalizar Torneo').setStyle(ButtonStyle.Danger).setEmoji('🛑'), new ButtonBuilder().setCustomId(`admin_return_to_main_panel`).setLabel('Volver').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'));
    const components = [];
    if (row1.components.length > 0) components.push(row1);
    components.push(row2);
    return { embeds: [embed], components };
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
