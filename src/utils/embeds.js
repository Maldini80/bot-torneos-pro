// src/utils/embeds.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TOURNAMENT_STATUS_ICONS, TOURNAMENT_FORMATS } from '../../config.js';

// MODIFICADO: Acepta isBusy para deshabilitar botones
export function createGlobalAdminPanel(isBusy = false) {
    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#2c3e50')
        .setTitle('Panel de Creación de Torneos')
        .setFooter({ text: 'Bot de Torneos v2.4' });

    embed.setDescription(isBusy 
        ? '🔴 **ESTADO: OCUPADO**\nEl bot está realizando una tarea crítica (creando/finalizando un torneo). Por favor, espera.' 
        : '✅ **ESTADO: LISTO**\nUsa el botón de abajo para crear un nuevo torneo.'
    );

    const globalActionsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_create_tournament_start').setLabel('Crear Nuevo Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆').setDisabled(isBusy),
        new ButtonBuilder().setCustomId('admin_force_reset_bot').setLabel('Reset Forzado').setStyle(ButtonStyle.Danger).setEmoji('🚨')
    );
    
    return { embeds: [embed], components: [globalActionsRow] };
}

// MODIFICADO: Acepta isBusy para cambiar de color y deshabilitar botones
export function createTournamentManagementPanel(tournament, isBusy = false) {
    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#e67e22')
        .setTitle(`Gestión del Torneo: ${tournament.nombre}`)
        .setDescription(isBusy 
            ? `🔴 **ESTADO: OCUPADO**\nID: \`${tournament.shortId}\`\nEl bot está realizando una operación global. Los controles están bloqueados.`
            : `✅ **ESTADO: LISTO**\nID: \`${tournament.shortId}\`\nEstado: **${tournament.status.replace(/_/g, ' ')}**\n\nUtiliza los botones de abajo para administrar.`
        )
        .setFooter({ text: 'Panel de control exclusivo para este torneo.' });

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    const isBeforeDraw = tournament.status === 'inscripcion_abierta';
    const hasEnoughTeamsForDraw = Object.keys(tournament.teams.aprobados).length >= 2;

    if (isBeforeDraw) {
        row1.addComponents(
            new ButtonBuilder().setCustomId(`admin_change_format_start_${tournament.shortId}`).setLabel('Cambiar Formato/Tipo').setStyle(ButtonStyle.Primary).setEmoji('🔄').setDisabled(isBusy),
            new ButtonBuilder().setCustomId(`admin_edit_tournament_start_${tournament.shortId}`).setLabel('Editar Premios/Cuota').setStyle(ButtonStyle.Secondary).setEmoji('📝').setDisabled(isBusy),
            new ButtonBuilder().setCustomId(`admin_force_draw_${tournament.shortId}`).setLabel('Forzar Sorteo').setStyle(ButtonStyle.Success).setEmoji('🎲').setDisabled(isBusy || !hasEnoughTeamsForDraw)
        );
        row2.addComponents(
             new ButtonBuilder().setCustomId(`admin_add_test_teams_${tournament.shortId}`).setLabel('Añadir Equipos Test').setStyle(ButtonStyle.Secondary).setEmoji('🧪').setDisabled(isBusy)
        );
    } else {
         row1.addComponents(
            new ButtonBuilder().setCustomId(`admin_simulate_matches_${tournament.shortId}`).setLabel('Simular Partidos').setStyle(ButtonStyle.Primary).setEmoji('⏩').setDisabled(isBusy)
        );
    }
    
    row2.addComponents(
        new ButtonBuilder().setCustomId(`admin_end_tournament_${tournament.shortId}`).setLabel('Finalizar Torneo').setStyle(ButtonStyle.Danger).setEmoji('🛑').setDisabled(isBusy)
    );

    const components = [];
    if (row1.components.length > 0) components.push(row1);
    if (row2.components.length > 0) components.push(row2);
    
    return { embeds: [embed], components };
}

// MODIFICADO: Corregido el texto del botón y el campo "Entry".
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

    const formatDescriptionES = TOURNAMENT_FORMATS[tournament.config.formatId].description;
    const formatDescriptionEN = TOURNAMENT_FORMATS[tournament.config.formatId].description; 

    let descriptionLines = [];

    if (tournament.config.isPaid) {
        descriptionLines.push('**Este es un torneo de pago. / This is a paid tournament.**');
        // CORRECCIÓN: Cambiado a solo "Entry"
        embed.addFields({ name: 'Entry', value: `${tournament.config.entryFee}€`, inline: true });
    } else {
        descriptionLines.push('**Este es un torneo gratuito. / This is a free tournament.**');
        embed.addFields({ name: 'Entry', value: 'Gratuito / Free', inline: true });
    }

    descriptionLines.push(`\n🇪🇸 ${formatDescriptionES}`);
    descriptionLines.push(`🇬🇧 ${formatDescriptionEN}`);
    embed.setDescription(descriptionLines.join('\n'));
    
    const row = new ActionRowBuilder();
    if (tournament.status === 'inscripcion_abierta' && teamsCount < format.size) {
        // CORRECCIÓN: Botón completamente bilingüe
        const buttonLabel = 'Inscribirme / Register';
        row.addComponents(new ButtonBuilder().setCustomId(`inscribir_equipo_start_${tournament.shortId}`).setLabel(buttonLabel).setStyle(ButtonStyle.Success).setEmoji('📝'));
    }
    
    row.addComponents(new ButtonBuilder().setCustomId(`user_view_details_${tournament.shortId}`).setLabel('Ver Detalles / View Details').setStyle(ButtonStyle.Secondary).setEmoji('ℹ️'));
    
    if (tournament.status === 'finalizado') {
        embed.setColor('#95a5a6').setTitle(`${TOURNAMENT_STATUS_ICONS.finalizado} ${tournament.nombre} (Finalizado / Finished)`);
    }
    if (tournament.status === 'inscripcion_abierta' && teamsCount >= format.size) {
        embed.setColor('#e67e22').setTitle(`${TOURNAMENT_STATUS_ICONS.cupo_lleno} ${tournament.nombre} (Cupo Lleno / Full)`);
    }

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

export function createClassificationEmbed(tournament) {
    const embed = new EmbedBuilder()
        .setColor('#1abc9c')
        .setTitle(`📊 Clasificación / Ranking - ${tournament.nombre}`)
        .setTimestamp().setFooter({ text: `ID del Torneo: ${tournament.shortId}`});

    if (Object.keys(tournament.structure.grupos).length === 0) {
        embed.setDescription('🇪🇸 La clasificación se mostrará aquí una vez que comience el torneo.\n🇬🇧 The ranking will be displayed here once the tournament starts.');
        return { embeds: [embed] };
    }

    const sortTeams = (a, b, groupName) => {
        if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
        if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
        if (a.stats.gf !== b.stats.gf) return b.stats.gf - a.stats.gf;
        
        const enfrentamiento = tournament.structure.calendario[groupName]?.find(p => 
            p.resultado && 
            ((p.equipoA.id === a.id && p.equipoB.id === b.id) || (p.equipoA.id === b.id && p.equipoB.id === a.id))
        );

        if (enfrentamiento) {
            const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
            if (enfrentamiento.equipoA.id === a.id) { // a vs b
                if (golesA > golesB) return -1;
                if (golesB > golesA) return 1;
            } else { // b vs a
                if (golesB > golesA) return -1;
                if (golesA > golesB) return 1;
            }
        }
        return 0;
    };

    const sortedGroups = Object.keys(tournament.structure.grupos).sort();
    for (const groupName of sortedGroups) {
        const grupo = tournament.structure.grupos[groupName];
        const equiposOrdenados = [...grupo.equipos].sort((a, b) => sortTeams(a, b, groupName));
        const nameWidth = 16, header = "EQUIPO/TEAM".padEnd(nameWidth) + "PJ  PTS  GF  GC   DG";
        const table = equiposOrdenados.map(e => {
            const teamName = e.nombre.slice(0, nameWidth - 1).padEnd(nameWidth);
            const pj = (e.stats.pj || 0).toString().padStart(2);
            const pts = (e.stats.pts || 0).toString().padStart(3);
            const gf = (e.stats.gf || 0).toString().padStart(3);
            const gc = (e.stats.gc || 0).toString().padStart(3);
            const dgVal = (e.stats.dg || 0);
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
