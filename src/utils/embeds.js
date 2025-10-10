// src/utils/embeds.js.
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { TOURNAMENT_STATUS_ICONS, TOURNAMENT_FORMATS, PDF_RULES_URL, DRAFT_POSITION_ORDER, DRAFT_POSITIONS } from '../../config.js';
import { getBotSettings, getDb } from '../../database.js';
import { t } from '../utils/translator.js';

const ruleEmbeds = [
    new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('📜 REGLAMENTO OFICIAL DE PARTIDO')
        .setDescription(
            `⏱️**Salidas del Partido**
Máximo de 2 salidas por equipo, antes del minuto 10 del partido.
Salir del partido una tercera vez o después del minuto 10 podrá ser sancionado.

⏳**Tiempo de Cortesía 10 minutos**

📏**Sin Límites de Altura**

🚫**Sin PlayStyles Prohibidos**`
        ),
    new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('📋 GUÍA DE REPORTES, PRUEBAS Y DISPUTAS')
        .setDescription(
            `• Al finalizar el partido, ambos capitanes debéis pulsar el botón 'Reportar Resultado' y poner el resultado.

• **Si detectas una irregularidad,** pulsar el botón 'Solicitar Arbitraje'
y explicar el problema a los árbitros en el hilo.`
        ),
    new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('⚠️ SANCIONES POR INCUMPLIMIENTO')
        .setDescription(
            `Las siguientes acciones conllevarán sanciones directas:

• **Incumplimiento del Tiempo de Cortesía:**
• **Consecuencia:** Partido perdido 1-0.`
        )
];

export async function createGlobalAdminPanel(view = 'main', isBusy = false) {
    const settings = await getBotSettings();
    const translationEnabled = settings.translationEnabled;
    const twitterEnabled = settings.twitterEnabled;

    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#2c3e50')
        .setFooter({ text: 'Bot de Torneos v3.2.0' });

    const components = [];
    const backButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_panel_main').setLabel('<< Volver al Menú Principal').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
    );

    switch (view) {
        // --- VISTA DE TORNEOS ---
        case 'tournaments':
            embed.setTitle('Gestión de Torneos');
            const tournamentActionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_create_tournament_start').setLabel('Crear Torneo (Grupos)').setStyle(ButtonStyle.Success).setEmoji('🏆').setDisabled(isBusy),
    new ButtonBuilder().setCustomId('create_flexible_league_start').setLabel('Crear Liguilla Flexible').setStyle(ButtonStyle.Primary).setEmoji('🔗').setDisabled(isBusy)
);
            components.push(tournamentActionsRow, backButtonRow);
            break;

        // --- VISTA DE DRAFTS ---
        case 'drafts':
            embed.setTitle('Gestión de Drafts');
            const draftActionsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_create_draft_start').setLabel('Crear Nuevo Draft').setStyle(ButtonStyle.Success).setEmoji('📝').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_manage_drafts_players').setLabel('Gestionar Jugadores/Drafts').setStyle(ButtonStyle.Primary).setEmoji('👥').setDisabled(isBusy)
            );
            const draftConfigRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_config_draft_min_quotas').setLabel('Config: Mínimos').setStyle(ButtonStyle.Secondary).setEmoji('📊').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_config_draft_max_quotas').setLabel('Config: Máximos').setStyle(ButtonStyle.Secondary).setEmoji('🧢').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_edit_verified_user_start').setLabel('Editar Usuario Verificado').setStyle(ButtonStyle.Danger).setEmoji('✏️')
            );
            components.push(draftActionsRow, draftConfigRow, backButtonRow);
            break;

        // --- VISTA DE AJUSTES GLOBALES ---
        case 'settings':
            embed.setTitle('Ajustes Globales del Bot');
            const globalSettingsRow1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_toggle_translation').setLabel(translationEnabled ? 'Desactivar Traducción' : 'Activar Traducción').setStyle(ButtonStyle.Primary).setEmoji(translationEnabled ? '🔇' : '🔊').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_toggle_twitter').setLabel(twitterEnabled ? 'Desactivar Twitter' : 'Activar Twitter').setStyle(ButtonStyle.Primary).setEmoji('🐦').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_update_channel_status').setLabel('Cambiar Icono Canal').setStyle(ButtonStyle.Secondary).setEmoji('🎨').setDisabled(isBusy)
            );
            const globalSettingsRow2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_force_reset_bot').setLabel('Reset Forzado').setStyle(ButtonStyle.Danger).setEmoji('🚨')
            );
            components.push(globalSettingsRow1, globalSettingsRow2, backButtonRow);
            break;

        // --- VISTA PRINCIPAL (POR DEFECTO) ---
        default:
            embed.setTitle('Panel de Creación y Gestión Global')
                 .setDescription(isBusy
                    ? '🔴 **ESTADO: OCUPADO**\nEl bot está realizando una tarea crítica. Por favor, espera.'
                    : `✅ **ESTADO: LISTO**\nTraducción: **${translationEnabled ? 'ACTIVADA' : 'DESACTIVADA'}** | Twitter: **${twitterEnabled ? 'ACTIVADO' : 'DESACTIVADO'}**`
                 );
            const mainRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_panel_tournaments').setLabel('Gestionar Torneos').setStyle(ButtonStyle.Success).setEmoji('🏆'),
                new ButtonBuilder().setCustomId('admin_panel_drafts').setLabel('Gestionar Drafts').setStyle(ButtonStyle.Primary).setEmoji('📝'),
                new ButtonBuilder().setCustomId('admin_panel_settings').setLabel('Ajustes Globales').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
            );
            components.push(mainRow);
            break;
    }

    return { embeds: [embed], components };
}

export function createTournamentManagementPanel(tournament, isBusy = false) {
    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#e67e22')
        .setTitle(`Gestión del Torneo: ${tournament.nombre}`)
        .setDescription(isBusy
            ? `🔴 **ESTADO: OCUPADO**\nID: \`${tournament.shortId}\`\nControles bloqueados.`
            : `✅ **ESTADO: LISTO**\nID: \`${tournament.shortId}\`\nEstado: **${tournament.status.replace(/_/g, ' ')}**`
        ).setFooter({ text: 'Panel de control exclusivo para este torneo.' });

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    row2.addComponents(
    new ButtonBuilder()
        .setCustomId(`admin_add_registered_team_start:${tournament.shortId}`)
        .setLabel('Añadir Equipo Registrado')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('➕')
        .setDisabled(isBusy),
        new ButtonBuilder()
            .setCustomId(`admin_manage_results_start:${tournament.shortId}`)
            .setLabel('Gestionar Resultados')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🗂️')
            .setDisabled(isBusy)
);
    const row3 = new ActionRowBuilder();

    const isBeforeDraw = tournament.status === 'inscripcion_abierta';
    const isGroupStage = tournament.status === 'fase_de_grupos';
    const hasEnoughTeamsForDraw = Object.keys(tournament.teams.aprobados).length >= 2;
    const hasCaptains = Object.keys(tournament.teams.aprobados).length > 0;

    if (isBeforeDraw) {
        row1.addComponents(
            new ButtonBuilder().setCustomId(`admin_change_format_start:${tournament.shortId}`).setLabel('Editar Torneo').setStyle(ButtonStyle.Primary).setEmoji('📝').setDisabled(isBusy),
            new ButtonBuilder().setCustomId(`admin_force_draw:${tournament.shortId}`).setLabel('Forzar Sorteo').setStyle(ButtonStyle.Success).setEmoji('🎲').setDisabled(isBusy || !hasEnoughTeamsForDraw),
            new ButtonBuilder().setCustomId(`admin_notify_changes:${tournament.shortId}`).setLabel('Notificar Cambios').setStyle(ButtonStyle.Primary).setEmoji('📢').setDisabled(isBusy || !hasCaptains)
        );
        if (tournament.teams.reserva && Object.keys(tournament.teams.reserva).length > 0) {
            row1.addComponents(
                new ButtonBuilder().setCustomId(`admin_manage_waitlist:${tournament.shortId}`).setLabel('Ver Reservas').setStyle(ButtonStyle.Secondary).setEmoji('📋').setDisabled(isBusy)
            );
        }
        row2.addComponents(
             new ButtonBuilder().setCustomId(`admin_add_test_teams:${tournament.shortId}`).setLabel('Añadir Equipos Test').setStyle(ButtonStyle.Secondary).setEmoji('🧪').setDisabled(isBusy)
        );
    } else {
         row1.addComponents( new ButtonBuilder().setCustomId(`admin_simulate_matches:${tournament.shortId}`).setLabel('Simular Partidos').setStyle(ButtonStyle.Primary).setEmoji('⏩').setDisabled(isBusy) );
    }

    if (hasCaptains) {
        row2.addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_edit_team_start:${tournament.shortId}`)
                .setLabel('Editar Equipo')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔧')
                .setDisabled(isBusy)
        );
    }
    
    if (isGroupStage) {
        row2.addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_undo_draw:${tournament.shortId}`)
                .setLabel('Eliminar Sorteo')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⏪')
                .setDisabled(isBusy)
        );
    }

    row2.addComponents(
        new ButtonBuilder()
            .setCustomId(`admin_assign_cocaptain_start:${tournament.shortId}`)
            .setLabel('Asignar Co-Capitán')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👥')
            .setDisabled(isBusy || !hasCaptains)
    );

    row3.addComponents( new ButtonBuilder().setCustomId(`admin_end_tournament:${tournament.shortId}`).setLabel('Finalizar Torneo').setStyle(ButtonStyle.Danger).setEmoji('🛑').setDisabled(isBusy) );

if (hasCaptains) { row3.addComponents(new ButtonBuilder().setCustomId(`admin_kick_team_start:${tournament.shortId}`).setLabel("Expulsar Equipo").setStyle(ButtonStyle.Danger).setEmoji('✖️').setDisabled(isBusy)); }
    
    // --- BLOQUE CORREGIDO PARA EVITAR EL ERROR ---
    const components = [];
    if (row1.components.length > 0) components.push(row1);
    if (row2.components.length > 0) components.push(row2);
    if (row3.components.length > 0) components.push(row3);

    return { embeds: [embed], components };
}

export function createDraftStatusEmbed(draft) {
    const captainCount = draft.captains.length;
    const nonCaptainPlayerCount = draft.players.filter(p => !p.isCaptain).length;
    const totalParticipants = captainCount + nonCaptainPlayerCount;
    
    const statusMap = {
        inscripcion: 'inscripcion_abierta',
        seleccion: 'fase_de_grupos',
        finalizado: 'finalizado',
        torneo_generado: 'finalizado',
        cancelado: 'cancelado'
    };
    const statusIcon = TOURNAMENT_STATUS_ICONS[statusMap[draft.status]] || '❓';
    let embedColor = '#3498db';
    if (draft.status === 'inscripcion') {
        embedColor = '#2ecc71';
    } else if (draft.status === 'finalizado' || draft.status === 'torneo_generado') {
        embedColor = '#95a5a6';
    } else if (draft.status === 'cancelado') {
        embedColor = '#e74c3c';
    }

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`${statusIcon} Draft: ${draft.name}`)
        .addFields(
            { name: 'Capitanes / Captains', value: `${captainCount}`, inline: true },
            { name: 'Jugadores / Players', value: `${nonCaptainPlayerCount}`, inline: true },
            { name: 'Total', value: `${totalParticipants}`, inline: true }
        )
        .setFooter({ text: `ID del Draft: ${draft.shortId}` });

    if (draft.config.isPaid) {
        embed.setDescription('**Este es un draft de pago.**\n\nPulsa el botón de abajo para empezar. La verificación de cuenta solo se realiza una vez y sirve para todos los drafts futuros.');
        embed.addFields(
            { name: 'Inscripción / Entry', value: `${draft.config.entryFee}€`, inline: true },
            { name: '🏆 Premio Campeón', value: `${draft.config.prizeCampeon}€`, inline: true },
            { name: '🥈 Premio Subcampeón', value: `${draft.config.prizeFinalista}€`, inline: true }
        );
    } else {
        embed.setDescription('**Este es un draft gratuito.**\n\nPulsa el botón de abajo para empezar. La verificación de cuenta solo se realiza una vez y sirve para todos los drafts futuros.');
    }

    const row = new ActionRowBuilder();

    if (draft.status === 'inscripcion') {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`start_verification_or_registration:${draft.shortId}`)
                .setLabel('Inscribirse o Verificar Cuenta')
                .setStyle(ButtonStyle.Success)
                .setEmoji('▶️'),
            // --- BOTÓN AÑADIDO ---
            new ButtonBuilder()
                .setCustomId(`darse_baja_draft_start:${draft.shortId}`)
                .setLabel('Darse de Baja')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('👋')
        );
    }

    const components = [];
if (row.components.length > 0) {
    components.push(row);
}

return { embeds: [embed], components };
}

export function createDraftManagementPanel(draft, isBusy = false) {
    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#e67e22')
        .setTitle(`Gestión del Draft: ${draft.name}`)
        .setDescription(isBusy
            ? `🔴 **ESTADO: OCUPADO**\nID: \`${draft.shortId}\`\nControles bloqueados.`
            : `✅ **ESTADO: LISTO**\nID: \`${draft.shortId}\`\nEstado: **${draft.status.replace(/_/g, ' ')}**`
        ).setFooter({ text: 'Panel de control exclusivo para este draft.' });

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    if (draft.status === 'inscripcion') {
    row1.addComponents(
        new ButtonBuilder().setCustomId(`draft_start_selection:${draft.shortId}`).setLabel('Iniciar Selección').setStyle(ButtonStyle.Success).setEmoji('▶️'),
        new ButtonBuilder().setCustomId(`admin_edit_draft_captain_start:${draft.shortId}`).setLabel('Editar Capitán').setStyle(ButtonStyle.Primary).setEmoji('🔧').setDisabled(isBusy),
        new ButtonBuilder().setCustomId(`admin_gestionar_participantes_draft:${draft.shortId}`).setLabel('Gestionar Participantes').setStyle(ButtonStyle.Secondary).setEmoji('👥').setDisabled(isBusy),
        new ButtonBuilder().setCustomId(`draft_add_test_players:${draft.shortId}`).setLabel('Añadir Jugadores Test').setStyle(ButtonStyle.Secondary).setEmoji('🧪').setDisabled(isBusy)
    );
}
    const dataAccessRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId(`consult_player_data_start:${draft.shortId}`)
        .setLabel('Consultar Datos de Jugador')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('ℹ️')
);

    if (draft.status === 'seleccion') {
        row1.addComponents(
            new ButtonBuilder().setCustomId(`draft_simulate_picks:${draft.shortId}`).setLabel('Simular Picks').setStyle(ButtonStyle.Primary).setEmoji('⏩').setDisabled(isBusy)
        );
    }

    if (draft.status === 'finalizado') {
    const captainCount = draft.captains.length;

    // Buscamos TODOS los formatos compatibles, incluyendo la liguilla
    let compatibleFormats = Object.entries(TOURNAMENT_FORMATS)
        .filter(([, format]) => format.isDraftCompatible && (format.size === captainCount || format.size === 0))
        .map(([key, format]) => ({
            label: format.label,
            description: format.description.slice(0, 100),
            value: key
        }));

    if (compatibleFormats.length > 0) {
        embed.addFields({ name: 'Acción Requerida', value: `El draft ha finalizado con **${captainCount} equipos**. Por favor, selecciona el formato de torneo que deseas crear.` });
        const formatMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_create_tournament_format:${draft.shortId}`)
            .setPlaceholder('Selecciona el formato para el torneo resultante')
            .addOptions(compatibleFormats);
        row1.addComponents(formatMenu);

        // La comprobación de la ruleta se hace independientemente de los formatos encontrados
        if (captainCount === 8 || captainCount === 16) {
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId(`draft_force_tournament_roulette:${draft.shortId}`)
                    .setLabel('Alternativa: Sorteo con Ruleta')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎡')
                    .setDisabled(isBusy)
            );
        }
    } else {
        embed.setColor('#e74c3c')
             .addFields({ name: '⚠️ Acción Requerida', value: `El draft ha finalizado con **${captainCount} equipos**. No hay formatos de torneo compatibles configurados.` });
    }
}

    row2.addComponents(new ButtonBuilder()
        .setCustomId(`draft_end:${draft.shortId}`)
        .setLabel('Finalizar Draft (Borrar)')
        .setStyle(ButtonStyle.Danger).setEmoji('🛑')
        .setDisabled(isBusy)
    );

    const components = [];
    if (row1.components.length > 0) components.push(row1);
    components.push(dataAccessRow);
    if (row2.components.length > 0) components.push(row2);

    return { embeds: [embed], components };
}

export function createDraftMainInterface(draft) {
    const availablePlayers = draft.players.filter(p => !p.isCaptain && !p.captainId);

    const playersEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Jugadores Disponibles para Seleccionar');

    if (availablePlayers.length > 0) {
        playersEmbed.setDescription('🔎 = Agente Libre\n🛡️ = Con Equipo');
        
        const groupedPlayers = {};
        DRAFT_POSITION_ORDER.forEach(pos => groupedPlayers[pos] = []);

        availablePlayers.sort((a, b) => a.psnId.localeCompare(b.psnId));

        availablePlayers.forEach(player => {
            if (groupedPlayers[player.primaryPosition]) {
                const statusEmoji = player.currentTeam === 'Libre' ? '🔎' : '🛡️';
                const secondaryPos = player.secondaryPosition && player.secondaryPosition !== 'NONE' ? ` (S: ${player.secondaryPosition})` : '';
                groupedPlayers[player.primaryPosition].push(`${statusEmoji} \`${player.psnId}${secondaryPos}\``);
            }
        });

        const columns = [[], [], []];
        DRAFT_POSITION_ORDER.forEach((pos, index) => {
            const columnContent = `**${DRAFT_POSITIONS[pos]}**\n` + (groupedPlayers[pos].length > 0 ? groupedPlayers[pos].join('\n') : '*Vacío*');
            columns[index % 3].push(columnContent);
        });
        
        columns.forEach((col, i) => {
            let colString = col.join('\n\n');
            if (colString.length > 1024) {
                 colString = colString.substring(0, 1021) + '...';
            }
            columns[i] = colString;
        });

        playersEmbed.addFields(
            { name: '\u200B', value: columns[0] || '\u200B', inline: true },
            { name: '\u200B', value: columns[1] || '\u200B', inline: true },
            { name: '\u200B', value: columns[2] || '\u200B', inline: true },
        );
    } else if (draft.status === 'inscripcion' && draft.players.length === 0) {
        playersEmbed.setDescription('Aún no se ha inscrito ningún jugador.');
    } else {
        playersEmbed.setDescription('¡Todos los jugadores han sido seleccionados!');
    }

    const teamsEmbed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('Equipos del Draft')
        .setDescription('Plantillas actuales de cada equipo.');

    const teamFields = [[], [], []];
    draft.captains.forEach((captain, index) => {
        const teamPlayers = draft.players.filter(p => p.captainId === captain.userId);
        const sortedPlayerList = teamPlayers
            .sort((a, b) => DRAFT_POSITION_ORDER.indexOf(a.primaryPosition) - DRAFT_POSITION_ORDER.indexOf(b.primaryPosition))
            .map(p => `• ${p.psnId} (${p.primaryPosition})`)
            .join('\n');

        const teamString = `**👑 E-${captain.teamName}**\n(Cap: ${captain.psnId})\n${teamPlayers.length > 0 ? sortedPlayerList : '*Vacío*'}`;
        teamFields[index % 3].push(teamString);
    });

    teamFields.forEach((col, i) => {
    if (col.length > 0) {
        let colString = col.join('\n\n');
        // Esta es la protección que faltaba. Si el texto es muy largo, lo corta.
        if (colString.length > 1024) {
            colString = colString.substring(0, 1021) + '...';
        }
        teamsEmbed.addFields({ name: '\u200B', value: colString, inline: true });
    }
});
    const turnOrderEmbed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🐍 Orden de Selección del Draft');

    if (draft.status === 'seleccion' && draft.selection.order.length > 0) {
    const picksList = [];
    const numCaptains = draft.selection.order.length;
    const totalPicks = numCaptains * 10;
        const captainMap = new Map(draft.captains.map(c => [c.userId, c.teamName]));

        const currentRound = Math.floor((draft.selection.currentPick - 1) / numCaptains) + 1;
        const totalRounds = Math.ceil(totalPicks / numCaptains);
        
        const startPickOfRound = (currentRound - 1) * numCaptains;
        const endPickOfRound = Math.min(startPickOfRound + numCaptains, totalPicks);

        for (let i = startPickOfRound; i < endPickOfRound; i++) {
            const roundForThisPick = Math.floor(i / numCaptains);
            const pickInRound = i % numCaptains;
            let captainId;

            if (roundForThisPick % 2 === 0) {
                captainId = draft.selection.order[pickInRound];
            } else {
                captainId = draft.selection.order[numCaptains - 1 - pickInRound];
            }

            const teamName = captainMap.get(captainId) || 'Equipo Desconocido';
            const pickNumber = i + 1;

            if (pickNumber === draft.selection.currentPick) {
                picksList.push(`**➡️ ${pickNumber}. ${teamName}**`);
            } else if (pickNumber < draft.selection.currentPick) {
                picksList.push(`✅ ${pickNumber}. ${teamName}`);
            } else {
                picksList.push(`⏳ ${pickNumber}. ${teamName}`);
            }
        }
        
        turnOrderEmbed.setDescription(`Turno actual: **Pick ${draft.selection.currentPick} de ${totalPicks}**`);
        turnOrderEmbed.addFields(
            { name: `Ronda ${currentRound} de ${totalRounds}`, value: picksList.join('\n') || 'N/A' }
        );

    } else {
        turnOrderEmbed.setDescription('El orden de selección se mostrará aquí cuando comience la fase de selección.');
    }

    return [playersEmbed, teamsEmbed, turnOrderEmbed];
}

export function createCaptainControlPanel(draft) {
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('🕹️ Panel de Control de Capitanes');

    const totalPicks = draft.captains.length * 10;
if (draft.status === 'seleccion' && draft.selection.currentPick <= totalPicks) {
        const currentCaptainId = draft.selection.order[draft.selection.turn];
        const captain = draft.captains.find(c => c.userId === currentCaptainId);

        embed.setDescription(`Es el turno de <@${currentCaptainId}> para el equipo **${captain.teamName}**.\n\n*Solo el capitán del turno (o un admin) puede usar los botones.*`);
        embed.setFooter({ text: `Pick #${draft.selection.currentPick} de ${totalPicks}` });

        const isPicking = draft.selection.isPicking || false;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`captain_pick_start:${draft.shortId}`).setLabel('Elegir Jugador').setStyle(ButtonStyle.Success).setEmoji('👤').setDisabled(isPicking),
            new ButtonBuilder().setCustomId(`captain_cancel_pick:${draft.shortId}:${currentCaptainId}`).setLabel('Cancelar mi Selección').setStyle(ButtonStyle.Danger).setDisabled(!isPicking)
        );
        return { embeds: [embed], components: [row] };
    }
    
    if (draft.status === 'finalizado') {
        embed.setDescription('**La fase de selección ha finalizado.**\nUn administrador debe pulsar "Forzar Torneo" en el panel de gestión para continuar.');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('captain_pick_start_disabled').setLabel('Elegir Jugador').setStyle(ButtonStyle.Success).setEmoji('👤').setDisabled(true),
            new ButtonBuilder().setCustomId('captain_manage_roster_disabled').setLabel('Gestionar Plantilla').setStyle(ButtonStyle.Primary).setEmoji('📋').setDisabled(true)
        );
        return { embeds: [embed], components: [row] };
    }

    if (draft.status === 'torneo_generado') {
    embed.setDescription('**El torneo ha sido generado.**\nUsa los botones de abajo para gestionar tu plantilla o consultar jugadores libres.');
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`captain_manage_roster_start:${draft.shortId}`)
            .setLabel('Gestionar Mi Plantilla')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋'),
        // --- BOTÓN NUEVO ---
        new ButtonBuilder()
            .setCustomId(`captain_view_free_agents:${draft.shortId}`)
            .setLabel('Ver Agentes Libres')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔎')
    );
    return { embeds: [embed], components: [row] };
}

    embed.setDescription('Este panel de control está inactivo.');
    return { embeds: [embed], components: [] };
}

export function createTeamRosterManagementEmbed(team, players, draftShortId) {
    const embed = new EmbedBuilder()
        .setColor('#1abc9c')
        .setTitle(`Gestión de Plantilla: ${team.teamName || team.nombre}`)
        .setDescription('Selecciona un jugador de la lista para ver sus detalles y gestionarlo.');

    const playerOptions = players.map(p => ({
        label: p.psnId,
        description: `Pos: ${p.primaryPosition} / ${p.secondaryPosition === 'NONE' ? 'N/A' : p.secondaryPosition}`,
        value: p.userId,
        emoji: p.isCaptain ? '👑' : '👤'
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`admin_select_player_from_roster:${draftShortId}:${team.userId || team.capitanId}`)
        .setPlaceholder('Selecciona un jugador...')
        .addOptions(playerOptions);

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)], flags: [MessageFlags.Ephemeral] };
}

export async function createPlayerManagementEmbed(client, player, draft, teamId, isAdmin, mode = 'manage') {
    const db = getDb();
    const verifiedData = await db.collection('verified_users').findOne({ discordId: player.userId });
    let playerRecord = await db.collection('player_records').findOne({ userId: player.userId });
    if (!playerRecord) playerRecord = { userId: player.userId, strikes: 0, history: [] };

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`ℹ️ Ficha de Datos: ${player.psnId}`)
        .setAuthor({ name: player.userName })
        .setThumbnail(await client.users.fetch(player.userId).then(u => u.displayAvatarURL()).catch(() => null));

    // Sección de Datos Verificados
    if (verifiedData) {
        embed.addFields(
            { name: '📋 Datos de Verificación', value: '\u200B' },
            { name: 'ID de Juego', value: `\`${verifiedData.gameId}\``, inline: true },
            { name: 'Twitter', value: verifiedData.twitter ? `\`${verifiedData.twitter}\`` : '`No registrado`', inline: true },
            { name: 'WhatsApp', value: `\`${verifiedData.whatsapp || 'No registrado'}\``, inline: true }
        );
    } else {
        embed.addFields({ name: '📋 Datos de Verificación', value: 'Este usuario no está verificado.' });
    }

    // Sección de Datos del Draft Actual
    const captain = player.captainId ? draft.captains.find(c => c.userId === player.captainId) : null;
    embed.addFields(
        { name: '📝 Datos del Draft Actual', value: '\u200B' },
        { name: 'Posición Primaria', value: `\`${player.primaryPosition}\``, inline: true },
        { name: 'Posición Secundaria', value: `\`${player.secondaryPosition === 'NONE' ? 'N/A' : player.secondaryPosition}\``, inline: true },
        { name: 'Equipo (Club)', value: `\`${player.currentTeam || 'N/A'}\``, inline: true },
        { name: 'Fichado por (Draft)', value: captain ? `\`${captain.teamName}\`` : '`Agente Libre`', inline: true },
        { name: 'Strikes Acumulados', value: `\`${playerRecord.strikes}\``, inline: true }
    );

    const components = [];
    // Solo mostramos botones de acción si estamos en modo "gestión"
    if (mode === 'manage') {
        const row1 = new ActionRowBuilder();
        row1.addComponents(
            new ButtonBuilder().setCustomId(`captain_dm_player:${player.userId}`).setLabel('Enviar MD').setStyle(ButtonStyle.Secondary).setEmoji('✉️')
        );

        if (!player.isCaptain) {
            row1.addComponents(
                new ButtonBuilder().setCustomId(`captain_request_kick:${draft.shortId}:${teamId}:${player.userId}`).setLabel('Solicitar Expulsión').setStyle(ButtonStyle.Danger).setEmoji('🚫')
            );
        }
        
        row1.addComponents(
            new ButtonBuilder().setCustomId(`captain_report_player:${draft.shortId}:${teamId}:${player.userId}`).setLabel('Reportar (Strike)').setStyle(ButtonStyle.Danger).setEmoji('⚠️')
        );
        
        components.push(row1);

        if (isAdmin) {
            const adminRow = new ActionRowBuilder();
            adminRow.addComponents(
                new ButtonBuilder().setCustomId(`admin_remove_strike:${player.userId}`).setLabel('Quitar Strike').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(playerRecord.strikes === 0),
                new ButtonBuilder().setCustomId(`admin_pardon_player:${player.userId}`).setLabel('Perdonar (Quitar todos)').setStyle(ButtonStyle.Success).setEmoji('♻️').setDisabled(playerRecord.strikes === 0)
            );
            if (!player.isCaptain) {
                 adminRow.addComponents(
                    new ButtonBuilder().setCustomId(`admin_force_kick_player:${draft.shortId}:${teamId}:${player.userId}`).setLabel('Forzar Expulsión').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`admin_invite_replacement_start:${draft.shortId}:${teamId}:${player.userId}`).setLabel('Invitar Reemplazo').setStyle(ButtonStyle.Primary).setEmoji('🔄')
                );
            }
            components.push(adminRow);
        }
    }

    return { embeds: [embed], components, flags: [MessageFlags.Ephemeral] };
}


export function createRuleAcceptanceEmbed(step, totalSteps, originalAction, entityId) {
    const ruleEmbed = ruleEmbeds[step - 1]; // Los embeds de reglas ya están en español, los dejamos así por simplicidad.
    
    const safeOriginalAction = originalAction || ''; 
    const isPlayer = safeOriginalAction.includes('player');
    const finalTotalSteps = isPlayer ? 1 : 3;

    // --- MODIFICADO: Footer bilingüe ---
    ruleEmbed.setFooter({ text: `Paso ${step} de ${finalTotalSteps} / Step ${step} of ${finalTotalSteps}\nDebes aceptar todas las normas. / You must accept all rules.` });

    const row = new ActionRowBuilder().addComponents(
        // --- MODIFICADO: Botones bilingües ---
        new ButtonBuilder()
            .setCustomId(`rules_accept:${step}:${originalAction}:${entityId}`)
            .setLabel('Acepto / I Accept')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId('rules_reject')
            .setLabel('Rechazar / Decline')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );
    return { embeds: [ruleEmbed], components: [row], flags: [MessageFlags.Ephemeral] };
}

export function createTournamentStatusEmbed(tournament) {
    const format = tournament.config.format;
    const teamsCount = Object.keys(tournament.teams.aprobados).length;
    let statusIcon = TOURNAMENT_STATUS_ICONS[tournament.status] || '❓';
    if (tournament.status === 'inscripcion_abierta' && teamsCount >= format.size) {
        statusIcon = TOURNAMENT_STATUS_ICONS['cupo_lleno'];
    }

    const embed = new EmbedBuilder()
        .setColor(tournament.status === 'inscripcion_abierta' ? '#2ecc71' : '#3498db')
        .setTitle(`${statusIcon} ${tournament.nombre}`)
        .setFooter({ text: `ID: ${tournament.shortId}` });

    // --- MODIFICADO: Descripción bilingüe ---
    const formatDescriptionES = TOURNAMENT_FORMATS[tournament.config.formatId].description;
    const formatDescriptionEN = TOURNAMENT_FORMATS[tournament.config.formatId].description_en;
    embed.setDescription(`🇪🇸 ${formatDescriptionES}\n🇬🇧 ${formatDescriptionEN}`);

    // --- MODIFICADO: Campos bilingües ---
    embed.addFields(
        { name: 'Formato / Format', value: format.label, inline: true },
        { name: 'Rondas / Rounds', value: tournament.config.matchType === 'idavuelta' ? 'Ida y Vuelta / Two Legs' : 'Solo Ida / One Leg', inline: true },
        { name: 'Equipos / Teams', value: `${teamsCount} / ${format.size}`, inline: true }
    );

    if (tournament.config.isPaid) {
        embed.addFields({ name: 'Inscripción / Entry Fee', value: `**${tournament.config.entryFee}€**`, inline: true });
        
        let prizePool = `🏆 **Campeón / Champion:** ${tournament.config.prizeCampeon}€`;
        if (tournament.config.prizeFinalista > 0) {
            prizePool += `\n🥈 **Finalista / Runner-up:** ${tournament.config.prizeFinalista}€`;
        }
        embed.addFields({ name: 'Premios / Prizes', value: prizePool, inline: true });

        let paymentMethods = '';
        if (tournament.config.paypalEmail) {
            paymentMethods += `\n**PayPal:** \`${tournament.config.paypalEmail}\``;
        }
        if (tournament.config.bizumNumber) {
            paymentMethods += `\n**Bizum:** \`${tournament.config.bizumNumber}\``;
        }
        if (paymentMethods) {
            embed.addFields({ name: 'Métodos de Pago / Payment Methods', value: paymentMethods.trim(), inline: false });
        }

    } else {
        embed.addFields({ name: 'Inscripción / Entry Fee', value: 'Gratuito / Free', inline: true });
    }

    if (tournament.config.startTime) {
        embed.addFields({ name: 'Inicio Programado / Scheduled Start', value: tournament.config.startTime, inline: false });
    }
    
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    const isFull = format.size > 0 && teamsCount >= format.size;

    if (tournament.status === 'inscripcion_abierta') {
        if (!isFull) {
            // --- MODIFICADO: Botón bilingüe ---
            row1.addComponents(new ButtonBuilder().setCustomId(`inscribir_equipo_start:${tournament.shortId}`).setLabel('Inscribirme / Register').setStyle(ButtonStyle.Success).setEmoji('📝'));
        } else if (!tournament.config.isPaid) {
            row1.addComponents(new ButtonBuilder().setCustomId(`inscribir_reserva_start:${tournament.shortId}`).setLabel('Lista de Reserva / Waitlist').setStyle(ButtonStyle.Primary).setEmoji('📋'));
        }
        row1.addComponents(new ButtonBuilder().setCustomId(`darse_baja_start:${tournament.shortId}`).setLabel('Darse de Baja / Unregister').setStyle(ButtonStyle.Danger).setEmoji('👋'));
    }

    // --- MODIFICADO: Botones bilingües ---
    row2.addComponents(
        new ButtonBuilder().setCustomId(`user_view_participants:${tournament.shortId}`).setLabel('Ver Participantes / View Participants').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
        new ButtonBuilder().setLabel('Normas / Rules').setStyle(ButtonStyle.Link).setURL(PDF_RULES_URL).setEmoji('📖')
    );

    if (tournament.status === 'finalizado') {
        embed.setColor('#95a5a6').setTitle(`🏁 ${tournament.nombre} (Finalizado / Finished)`);
    }

    const components = [];
    if(row1.components.length > 0) components.push(row1);
    if(row2.components.length > 0) components.push(row2);

    return { embeds: [embed], components };
}
export function createTeamListEmbed(tournament) {
    const approvedTeams = Object.values(tournament.teams.aprobados);
    const format = tournament.config.format;
    let description = '🇪🇸 Aún no hay equipos inscritos.\n🇬🇧 No teams have registered yet.';

    if (approvedTeams.length > 0) {
        description = approvedTeams.map((team, index) => {
            let teamString = `${index + 1}. **${team.nombre}** (Cap: ${team.capitanTag}`;
            if (team.coCaptainTag) {
                teamString += `, Co-Cap: ${team.coCaptainTag}`;
            }
            teamString += `, EAFC: \`${team.eafcTeamName}\`)`;
            return teamString;
        }).join('\n');
    }

    const embed = new EmbedBuilder().setColor('#1abc9c').setTitle(`📋 Equipos Inscritos - ${tournament.nombre}`).setDescription(description).setFooter({ text: `Total: ${approvedTeams.length} / ${format.size}` });
    return { embeds: [embed] };
}

export function createClassificationEmbed(tournament) {
    const embed = new EmbedBuilder().setColor('#1abc9c').setTitle(`📊 Clasificación / Ranking`).setTimestamp();
    if (Object.keys(tournament.structure.grupos).length === 0) {
        embed.setDescription('🇪🇸 La clasificación se mostrará aquí una vez que comience el torneo.\n🇬🇧 The ranking will be displayed here once the tournament starts.');
        return { embeds: [embed] };
    }
    const sortTeams = (a, b, groupName) => {
        if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
        if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
        if (a.stats.gf !== b.stats.gf) return b.stats.gf - a.stats.gf;
        const enfrentamiento = tournament.structure.calendario[groupName]?.find(p => p.resultado && ((p.equipoA.id === a.id && p.equipoB.id === b.id) || (p.equipoA.id === b.id && p.equipoB.id === a.id)));
        if (enfrentamiento) {
            const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
            if (enfrentamiento.equipoA.id === a.id) { if (golesA > golesB) return -1; if (golesB > golesA) return 1; }
            else { if (golesB > golesA) return -1; if (golesA > golesB) return 1; }
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
            const pj = (e.stats.pj || 0).toString().padStart(2); const pts = (e.stats.pts || 0).toString().padStart(3);
            const gf = (e.stats.gf || 0).toString().padStart(3); const gc = (e.stats.gc || 0).toString().padStart(3);
            const dgVal = (e.stats.dg || 0); const dg = (dgVal >= 0 ? '+' : '') + dgVal.toString();
            const paddedDg = dg.padStart(4);
            return `${teamName}${pj}  ${pts}  ${gf}  ${gc}  ${paddedDg}`;
        }).join('\n');
        embed.addFields({ name: `**${groupName}**`, value: "```\n" + header + "\n" + table + "\n```" });
    }
    return { embeds: [embed] };
}

export function createCalendarEmbed(tournament) {
    const embed = new EmbedBuilder().setColor('#9b59b6').setTitle(`🗓️ Calendario / Schedule`).setTimestamp();
    const hasGroupStage = Object.keys(tournament.structure.calendario).length > 0;
    const hasKnockoutStage = tournament.config.format.knockoutStages.some(
        stage => tournament.structure.eliminatorias && tournament.structure.eliminatorias[stage]
    );

    if (!hasGroupStage && !hasKnockoutStage) {
        embed.setDescription('🇪🇸 El calendario de partidos se mostrará aquí.\n🇬🇧 The match schedule will be displayed here.');
        return { embeds: [embed] };
    }

    if(hasGroupStage) {
        const sortedGroups = Object.keys(tournament.structure.calendario).sort();
        for (const groupName of sortedGroups) {
            const partidosDelGrupo = tournament.structure.calendario[groupName];
            
            // --- INICIO DE LA LÓGICA DINÁMICA ---
            // Agrupamos los partidos por número de jornada
            const partidosPorJornada = {};
            for (const partido of partidosDelGrupo) { 
                if (!partidosPorJornada[partido.jornada]) {
                    partidosPorJornada[partido.jornada] = [];
                }
                partidosPorJornada[partido.jornada].push(partido); 
            }
            
            let groupScheduleText = ''; 
            const nameWidth = 15, centerWidth = 6;
            
            // Recorremos las jornadas que hemos encontrado, en orden numérico
            for (const jornadaNum of Object.keys(partidosPorJornada).sort((a, b) => a - b)) {
                groupScheduleText += `Jornada / Round ${jornadaNum}\n`;
                for (const partido of partidosPorJornada[jornadaNum]) {
                    const centerText = partido.resultado ? partido.resultado : 'vs';
                    const paddingTotal = centerWidth - centerText.length; 
                    const paddingInicio = Math.ceil(paddingTotal / 2);
                    const paddingFin = Math.floor(paddingTotal / 2);
                    const paddedCenter = ' '.repeat(paddingInicio) + centerText + ' '.repeat(paddingFin);
                    const equipoA = partido.equipoA.nombre.slice(0, nameWidth).padEnd(nameWidth);
                    const equipoB = partido.equipoB.nombre.slice(0, nameWidth).padStart(nameWidth);
                    groupScheduleText += `${equipoA}${paddedCenter}${equipoB}\n`;
                }
            }
            // --- FIN DE LA LÓGICA DINÁMICA ---
            
            embed.addFields({ name: `**${groupName}**`, value: `\`\`\`\n${groupScheduleText.trim()}\n\`\`\`` });
        }
    }

    if(hasKnockoutStage) {
        for (const stageKey of tournament.config.format.knockoutStages) {
            const stageMatches = tournament.structure.eliminatorias[stageKey];
            if (!stageMatches || (Array.isArray(stageMatches) && stageMatches.length === 0)) continue;

            const stageName = stageKey.charAt(0).toUpperCase() + stageKey.slice(1);
            const matches = Array.isArray(stageMatches) ? stageMatches : [stageMatches];

            let stageScheduleText = '';
            const nameWidth = 15, centerWidth = 6;

            for (const partido of matches) {
                if (!partido.equipoA || !partido.equipoB) continue;
                const centerText = partido.resultado ? partido.resultado : 'vs';
                const paddingTotal = centerWidth - centerText.length;
                const paddingInicio = Math.ceil(paddingTotal / 2);
                const paddingFin = Math.floor(paddingTotal / 2);
                const paddedCenter = ' '.repeat(paddingInicio) + centerText + ' '.repeat(paddingFin);
                const equipoA = partido.equipoA.nombre.slice(0, nameWidth).padEnd(nameWidth);
                const equipoB = partido.equipoB.nombre.slice(0, nameWidth).padStart(nameWidth);
                stageScheduleText += `${equipoA}${paddedCenter}${equipoB}\n`;
            }

            if (stageScheduleText) {
                embed.addFields({ name: `**${stageName}**`, value: `\`\`\`\n${stageScheduleText.trim()}\n\`\`\`` });
            }
        }
    }

    return { embeds: [embed] };
}

export function createCasterInfoEmbed(teamData, tournament) {
    const embed = new EmbedBuilder()
        .setColor('#1abc9c')
        .setTitle(`📢 Nuevo Equipo Inscrito / New Team Registered: ${teamData.nombre}`)
        .setAuthor({ name: `Torneo / Tournament: ${tournament.nombre}`})
        .addFields(
            { name: 'Capitán / Captain', value: teamData.capitanTag, inline: true },
            { name: 'ID Capitán / Captain ID', value: `\`${teamData.capitanId}\``, inline: true },
            { name: 'Twitter', value: teamData.twitter ? `[Ver / View](${teamData.twitter.startsWith('http') ? '' : 'https://twitter.com/'}${teamData.twitter})` : 'N/A', inline: true },
            { name: 'Canal de Stream / Stream Channel', value: teamData.streamChannel || 'N/A', inline: false }
        )
        .setTimestamp();

    return { embeds: [embed] };
}
    
/**
 * NUEVO: Crea el embed de advertencia para capitanes sobre la importancia de su stream.
 */
export function createStreamerWarningEmbed(member, platform, originalAction, entityId, teamIdOrPosition = 'NONE') {
    const embed = new EmbedBuilder()
        .setColor('#E67E22')
        .setTitle(t('streamerWarningTitle', member))
        .addFields(
            { name: t('streamerWarningField1', member), value: '\u200B' },
            { name: t('streamerWarningField2', member), value: '\u200B' },
            { name: t('streamerWarningField3', member), value: t('streamerWarningBody', member) }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`streamer_warning_accept:${platform}:${originalAction}:${entityId}:${teamIdOrPosition}`)
            .setLabel(t('understoodButton', member))
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId('rules_reject')
            .setLabel(t('cancelButton', member))
            .setStyle(ButtonStyle.Danger)
    );
    
    return { embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] };
}
