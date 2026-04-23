// src/utils/embeds.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { TOURNAMENT_STATUS_ICONS, TOURNAMENT_FORMATS, PDF_RULES_URL, DRAFT_POSITION_ORDER, DRAFT_POSITIONS } from '../../config.js';
import { getBotSettings, getDb } from '../../database.js';
import { LEAGUE_EMOJIS } from '../logic/eloLogic.js';

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
    const eaScannerEnabled = settings.eaScannerEnabled || false;

    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#2c3e50')
        .setFooter({ text: 'Bot de Torneos v3.2.0' });

    const components = [];
    const backButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_panel_main').setLabel('<< Volver al Menú Principal').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
    );

    switch (view) {
        case 'tournaments':
            embed.setTitle('Gestión de Torneos');
            const tournamentActionsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_create_tournament_start').setLabel('Crear Torneo (Grupos)').setStyle(ButtonStyle.Success).setEmoji('🏆').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('create_flexible_league_start').setLabel('Crear Liguilla Flexible').setStyle(ButtonStyle.Primary).setEmoji('🔗').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_distribute_whatsapp_start').setLabel('Distribuir WA').setStyle(ButtonStyle.Secondary).setEmoji('📋').setDisabled(isBusy)
            );
            const poolActionsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_create_pool_start').setLabel('Crear Bolsa').setStyle(ButtonStyle.Primary).setEmoji('📦').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_list_pools').setLabel('Gestionar Bolsas').setStyle(ButtonStyle.Secondary).setEmoji('🗂️').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_pool_to_tournament').setLabel('Usar Bolsa en Torneo').setStyle(ButtonStyle.Success).setEmoji('🎯').setDisabled(isBusy)
            );
            const tournamentToolsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_regenerate_panel_start').setLabel('Regenerar Panel').setStyle(ButtonStyle.Danger).setEmoji('🔄').setDisabled(isBusy)
            );
            components.push(tournamentActionsRow, poolActionsRow, tournamentToolsRow, backButtonRow);
            break;

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

        case 'settings':
            embed.setTitle('Ajustes Globales del Bot')
                 .setDescription(isBusy
                    ? '🔴 **ESTADO: OCUPADO**\nEl bot está realizando una tarea crítica. Por favor, espera.'
                    : `✅ **ESTADO: LISTO**\nTraducción: **${translationEnabled ? 'ACTIVADA' : 'DESACTIVADA'}** | Twitter: **${twitterEnabled ? 'ACTIVADO' : 'DESACTIVADO'}** | EA Scanner: **${eaScannerEnabled ? 'ACTIVADO' : 'DESACTIVADO'}**`
                 );
            const globalSettingsRow1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_toggle_translation').setLabel(translationEnabled ? 'Desactivar Traducción' : 'Activar Traducción').setStyle(ButtonStyle.Primary).setEmoji(translationEnabled ? '🔇' : '🔊').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_toggle_twitter').setLabel(twitterEnabled ? 'Desactivar Twitter' : 'Activar Twitter').setStyle(ButtonStyle.Primary).setEmoji('🐦').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_update_channel_status').setLabel('Cambiar Icono Canal').setStyle(ButtonStyle.Secondary).setEmoji('🎨').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_toggle_ea_scanner').setLabel(eaScannerEnabled ? 'Desactivar EA Scanner' : 'Activar EA Scanner').setStyle(ButtonStyle.Primary).setEmoji('🎮').setDisabled(isBusy)
            );
            const globalSettingsRow2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_manage_elo').setLabel('Gestionar ELO').setStyle(ButtonStyle.Success).setEmoji('📈').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_manage_team_strikes').setLabel('Gestionar Strikes').setStyle(ButtonStyle.Danger).setEmoji('⚠️').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_edit_rules_url').setLabel('Editar Link Normativa').setStyle(ButtonStyle.Primary).setEmoji('🔗').setDisabled(isBusy),
                new ButtonBuilder().setCustomId('admin_force_reset_bot').setLabel('Reset Forzado').setStyle(ButtonStyle.Danger).setEmoji('🚨').setDisabled(isBusy)
            );
            components.push(globalSettingsRow1, globalSettingsRow2, backButtonRow);
            break;

        default:
            embed.setTitle('Panel de Creación y Gestión Global')
                .setDescription(isBusy
                    ? '🔴 **ESTADO: OCUPADO**\nEl bot está realizando una tarea crítica. Por favor, espera.'
                    : `✅ **ESTADO: LISTO**\nTraducción: **${translationEnabled ? 'ACTIVADA' : 'DESACTIVADA'}** | Twitter: **${twitterEnabled ? 'ACTIVADO' : 'DESACTIVADO'}**`
                );
            const mainRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_panel_tournaments').setLabel('Gestionar Torneos').setStyle(ButtonStyle.Success).setEmoji('🏆'),
                new ButtonBuilder().setCustomId('admin_panel_drafts').setLabel('Gestionar Drafts').setStyle(ButtonStyle.Primary).setEmoji('📝'),
                new ButtonBuilder().setCustomId('admin_panel_settings').setLabel('Ajustes Globales').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
                new ButtonBuilder().setCustomId('admin_panel_manual_results').setLabel('Gestionar Resultados Manuales').setStyle(ButtonStyle.Danger).setEmoji('🛠️')
            );
            components.push(mainRow);
            break;
    }

    return { embeds: [embed], components };
}

export function createTournamentManagementPanel(tournament, isBusy = false) {
    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#e67e22')
        .setTitle(`Gestión del Torneo: ${tournament.nombre}`) // Backticks importantes aqui
        .setDescription(isBusy
            ? `🔴 **ESTADO: OCUPADO**\nID: \`${tournament.shortId}\`\nControles bloqueados.`
            : `✅ **ESTADO: LISTO**\nID: \`${tournament.shortId}\`\nEstado: **${tournament.status.replace(/_/g, ' ')}**`
        ).setFooter({ text: 'Panel de control exclusivo para este torneo.' });

    const allButtons = [];

    const isBeforeDraw = tournament.status === 'inscripcion_abierta';
    const isGroupStage = tournament.status === 'fase_de_grupos';
    const hasEnoughTeamsForDraw = Object.keys(tournament.teams.aprobados).length >= 2;
    const hasCaptains = Object.keys(tournament.teams.aprobados).length > 0;

    // Primary actions based on tournament phase
    if (isBeforeDraw) {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_change_format_start:${tournament.shortId}`).setLabel('Editar Torneo').setStyle(ButtonStyle.Primary).setEmoji('📝').setDisabled(isBusy));
        allButtons.push(new ButtonBuilder().setCustomId(`admin_force_draw:${tournament.shortId}`).setLabel('Forzar Sorteo').setStyle(ButtonStyle.Success).setEmoji('🎲').setDisabled(isBusy || !hasEnoughTeamsForDraw));
        allButtons.push(new ButtonBuilder().setCustomId(`admin_notify_changes:${tournament.shortId}`).setLabel('Notificar Cambios').setStyle(ButtonStyle.Primary).setEmoji('📢').setDisabled(isBusy || !hasCaptains));

        if (tournament.config.paidSubType !== 'draft') {
            const isRegistrationClosed = tournament.config.registrationClosed === true;
            const toggleBtnLabel = isRegistrationClosed ? 'Abrir Inscripción' : 'Cerrar Inscripción';
            const toggleBtnStyle = isRegistrationClosed ? ButtonStyle.Success : ButtonStyle.Danger;
            allButtons.push(new ButtonBuilder().setCustomId(`admin_toggle_registration:${tournament.shortId}`).setLabel(toggleBtnLabel).setStyle(toggleBtnStyle).setEmoji(isRegistrationClosed ? '🔓' : '🔒').setDisabled(isBusy));
        }

        if (tournament.teams.reserva && Object.keys(tournament.teams.reserva).length > 0) {
            allButtons.push(new ButtonBuilder().setCustomId(`admin_manage_waitlist:${tournament.shortId}`).setLabel('Ver Reservas').setStyle(ButtonStyle.Secondary).setEmoji('📋').setDisabled(isBusy));
        }
    } else {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_simulate_matches:${tournament.shortId}`).setLabel('Simular Partidos').setStyle(ButtonStyle.Primary).setEmoji('⏩').setDisabled(isBusy));
    }

    // Team and result management
    allButtons.push(new ButtonBuilder().setCustomId(`admin_manage_results_start:${tournament.shortId}`).setLabel('Gestionar Resultados').setStyle(ButtonStyle.Primary).setEmoji('🗂️').setDisabled(isBusy));
    allButtons.push(new ButtonBuilder().setCustomId(`admin_recover_threads:${tournament.shortId}`).setLabel('Reparar Hilos').setStyle(ButtonStyle.Secondary).setEmoji('🔧').setDisabled(isBusy));

    if (isGroupStage && tournament.config.formatId === 'flexible_league') {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_recover_round_start:${tournament.shortId}`).setLabel('Regenerar Jornada').setStyle(ButtonStyle.Danger).setEmoji('♻️').setDisabled(isBusy));
    }

    if (hasCaptains) {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_edit_team_start:${tournament.shortId}`).setLabel('Editar Equipo').setStyle(ButtonStyle.Primary).setEmoji('🔧').setDisabled(isBusy));
        allButtons.push(new ButtonBuilder().setCustomId(`admin_manage_cocaptains_start:${tournament.shortId}`).setLabel('Gestionar Ayudantes').setStyle(ButtonStyle.Secondary).setEmoji('🤝').setDisabled(isBusy));
    }

    // Undo draw + group/knockout stage specific actions
    const knockoutStageNames = ['treintaidosavos', 'dieciseisavos', 'octavos', 'cuartos', 'semifinales', 'final'];
    const isKnockoutStage = knockoutStageNames.includes(tournament.status);

    if (isGroupStage || isKnockoutStage) {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_undo_draw:${tournament.shortId}`).setLabel('Eliminar Sorteo').setStyle(ButtonStyle.Danger).setEmoji('⏪').setDisabled(isBusy));
    }

    if (isGroupStage) {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_manual_swap_start:${tournament.shortId}`).setLabel('Cambio Manual').setStyle(ButtonStyle.Secondary).setEmoji('🔀').setDisabled(isBusy));
    }

    // Editar restricciones de liga (solo para torneos gratuitos)
    if (!tournament.config.isPaid && isBeforeDraw) {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_edit_league_restrictions:${tournament.shortId}`).setLabel('Editar Ligas').setStyle(ButtonStyle.Secondary).setEmoji('⚙️').setDisabled(isBusy));
        allButtons.push(new ButtonBuilder().setCustomId(`admin_add_registered_team_start:${tournament.shortId}`).setLabel('Añadir Equipo Registrado').setStyle(ButtonStyle.Secondary).setEmoji('➕').setDisabled(isBusy));
    }

    if (isBeforeDraw) {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_add_test_teams:${tournament.shortId}`).setLabel('Añadir Equipos Test').setStyle(ButtonStyle.Secondary).setEmoji('🧪').setDisabled(isBusy));
    }

    if (hasCaptains) {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_kick_team_start:${tournament.shortId}`).setLabel('Expulsar Equipo').setStyle(ButtonStyle.Danger).setEmoji('👢').setDisabled(isBusy));
        allButtons.push(new ButtonBuilder().setCustomId(`admin_replace_team_start:${tournament.shortId}`).setLabel('Sustituir Equipo').setStyle(ButtonStyle.Primary).setEmoji('🔄').setDisabled(isBusy));
    }

    // Destructive actions + rename
    allButtons.push(new ButtonBuilder().setCustomId(`admin_rename_tournament:${tournament.shortId}`).setLabel('Renombrar').setStyle(ButtonStyle.Secondary).setEmoji('✏️').setDisabled(isBusy));
    allButtons.push(new ButtonBuilder().setCustomId(`admin_end_tournament:${tournament.shortId}`).setLabel('Finalizar Torneo').setStyle(ButtonStyle.Danger).setEmoji('🛑').setDisabled(isBusy));

    // External Draft tools
    if (tournament.config.paidSubType === 'draft') {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_draft_ext_roulette:${tournament.shortId}`).setLabel('Ruleta Capitanes').setStyle(ButtonStyle.Primary).setEmoji('🎲').setDisabled(isBusy));
        allButtons.push(new ButtonBuilder().setCustomId(`admin_draft_ext_pickorder:${tournament.shortId}`).setLabel('Orden Picks').setStyle(ButtonStyle.Success).setEmoji('🏆').setDisabled(isBusy));
        allButtons.push(new ButtonBuilder().setCustomId(`admin_draft_ext_import_start:${tournament.shortId}`).setLabel('Importar WA').setStyle(ButtonStyle.Secondary).setEmoji('📥').setDisabled(isBusy));
    }

    // Configuración y utilidades adicionales
    if (hasCaptains) {
        allButtons.push(new ButtonBuilder().setCustomId(`admin_assign_cocaptain_start:${tournament.shortId}`).setLabel('Asignar Co-Capitán').setStyle(ButtonStyle.Secondary).setEmoji('👥').setDisabled(isBusy));
    }

    allButtons.push(new ButtonBuilder().setCustomId(`admin_set_promo_image:${tournament.shortId}`).setLabel('Imagen Promo').setStyle(ButtonStyle.Secondary).setEmoji('🌄').setDisabled(isBusy));
    allButtons.push(new ButtonBuilder().setCustomId(`admin_set_rules_link:${tournament.shortId}`).setLabel('Link Normas').setStyle(ButtonStyle.Secondary).setEmoji('🔗').setDisabled(isBusy));

    if (!tournament.config.isPaid) {
        const isIgnoreElo = tournament.config.requireElo === false;
        const eloBtnLabel = isIgnoreElo ? 'Requerir ELO' : 'Ignorar ELO';
        const eloBtnStyle = isIgnoreElo ? ButtonStyle.Success : ButtonStyle.Secondary;
        allButtons.push(new ButtonBuilder().setCustomId(`admin_toggle_elo:${tournament.shortId}`).setLabel(eloBtnLabel).setStyle(eloBtnStyle).setEmoji(isIgnoreElo ? '🔒' : '🔓').setDisabled(isBusy));
    }

    // EA Tools
    allButtons.push(new ButtonBuilder().setCustomId(`admin_generate_tournament_stats:${tournament.shortId}`).setLabel('Reporte EA (Mejor 11)').setStyle(ButtonStyle.Primary).setEmoji('📊').setDisabled(isBusy));
    allButtons.push(new ButtonBuilder().setCustomId(`admin_sync_ea_names:${tournament.shortId}`).setLabel('Sync Nombres EA').setStyle(ButtonStyle.Secondary).setEmoji('🔄').setDisabled(isBusy));

    if (tournament.config.paidSubType === 'draft') {
        allButtons.push(new ButtonBuilder().setCustomId(`ext_reg_manage:${tournament.shortId}`).setLabel('Gestionar Inscripciones').setStyle(ButtonStyle.Primary).setEmoji('📋').setDisabled(isBusy));
    }

    if (tournament.config.formatId === 'knockout_only' && !tournament.config.isPaid) {
        const isManualPairing = tournament.config.manualKnockoutPairing === true;
        allButtons.push(new ButtonBuilder().setCustomId(`admin_toggle_manual_knockout:${tournament.shortId}`).setLabel(isManualPairing ? 'Pairing: Manual' : 'Pairing: Auto').setStyle(isManualPairing ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji(isManualPairing ? '🛠️' : '🎲').setDisabled(isBusy));
    }

    // Chunk buttons into rows of max 5
    const components = [];
    for (let i = 0; i < allButtons.length; i += 5) {
        const row = new ActionRowBuilder().addComponents(allButtons.slice(i, i + 5));
        components.push(row);
    }

    // Fail-safe: if somehow there are more than 5 rows, slice them to prevent API crash
    if (components.length > 5) {
        console.warn(`[WARNING] Tournament management panel for ${tournament.shortId} exceeded 5 ActionRows! Truncating.`);
        components.length = 5;
    }

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
        .setTitle(`${statusIcon} Draft: ${draft.name}`) // Backticks aqui
        .addFields(
            { name: 'Capitanes / Captains', value: `${captainCount}`, inline: true },
            { name: 'Jugadores / Players', value: `${nonCaptainPlayerCount}`, inline: true },
            { name: 'Total', value: `${totalParticipants}`, inline: true }
        )
        .setFooter({ text: `ID del Draft: ${draft.shortId}` }); // Backticks aqui

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
        .setTitle(`Gestión del Draft: ${draft.name}`) // Backticks aqui
        .setDescription(isBusy
            ? `🔴 **ESTADO: OCUPADO**\nID: \`${draft.shortId}\`\nControles bloqueados.`
            : `✅ **ESTADO: LISTO**\nID: \`${draft.shortId}\`\nEstado: **${draft.status.replace(/_/g, ' ')}**`
        ).setFooter({ text: 'Panel de control exclusivo para este draft.' });

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    if (draft.status === 'inscripcion') {
        row1.addComponents(
            new ButtonBuilder().setCustomId(`draft_start_selection:${draft.shortId}`).setLabel('Iniciar Selección').setStyle(ButtonStyle.Success).setEmoji('▶️'),
            new ButtonBuilder().setCustomId(`admin_edit_draft_config_start:${draft.shortId}`).setLabel('Editar Draft').setStyle(ButtonStyle.Primary).setEmoji('⚙️').setDisabled(isBusy),
            new ButtonBuilder().setCustomId(`admin_edit_draft_captain_start:${draft.shortId}`).setLabel('Editar Capitán').setStyle(ButtonStyle.Primary).setEmoji('🔧').setDisabled(isBusy),
            new ButtonBuilder().setCustomId(`admin_gestionar_participantes_draft:${draft.shortId}`).setLabel('Expulsar Jugador').setStyle(ButtonStyle.Secondary).setEmoji('✖️').setDisabled(isBusy)
        );

        row2.addComponents(
            new ButtonBuilder().setCustomId(`admin_add_player_manual_start:${draft.shortId}`).setLabel('Añadir Jugador Manual').setStyle(ButtonStyle.Success).setEmoji('👤').setDisabled(isBusy),
            new ButtonBuilder().setCustomId(`admin_add_captain_manual_start:${draft.shortId}`).setLabel('Añadir Capitán Manual').setStyle(ButtonStyle.Primary).setEmoji('👑').setDisabled(isBusy),
            new ButtonBuilder().setCustomId(`admin_import_players_start:${draft.shortId}`).setLabel('Importar desde WhatsApp').setStyle(ButtonStyle.Secondary).setEmoji('📥').setDisabled(isBusy),
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

    const playersEmbeds = [];
    const mainEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Jugadores Disponibles para Seleccionar');

    if (availablePlayers.length > 0) {
        playersEmbeds.push(mainEmbed);

        const groupedPlayers = {};
        DRAFT_POSITION_ORDER.forEach(pos => groupedPlayers[pos] = []);

        availablePlayers.sort((a, b) => a.psnId.localeCompare(b.psnId));

        availablePlayers.forEach(player => {
            if (groupedPlayers[player.primaryPosition]) {
                const secondaryPos = player.secondaryPosition && player.secondaryPosition !== 'NONE' ? ` (S: ${player.secondaryPosition})` : '';
                groupedPlayers[player.primaryPosition].push(`\`${player.psnId}${secondaryPos}\``);
            }
        });

        // Crear un embed por cada posición que tenga jugadores
        DRAFT_POSITION_ORDER.forEach(pos => {
            if (groupedPlayers[pos].length > 0) {
                const posEmbed = new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle(`Posición: ${DRAFT_POSITIONS[pos]}`);

                // Dividir en columnas de máximo 1024 caracteres
                let currentStr = '';
                const fields = [];
                for (let i = 0; i < groupedPlayers[pos].length; i++) {
                    const line = `**${i + 1}.** ${groupedPlayers[pos][i]}\n`;
                    if (currentStr.length + line.length > 1024) {
                        fields.push({ name: '\u200B', value: currentStr, inline: true });
                        currentStr = line;
                    } else {
                        currentStr += line;
                    }
                }
                if (currentStr.length > 0) fields.push({ name: '\u200B', value: currentStr, inline: true });

                posEmbed.addFields(fields);
                playersEmbeds.push(posEmbed);
            }
        });

    } else if (draft.status === 'inscripcion' && draft.players.length === 0) {
        mainEmbed.setDescription('Aún no se ha inscrito ningún jugador.');
        playersEmbeds.push(mainEmbed);
    } else {
        mainEmbed.setDescription('¡Todos los jugadores han sido seleccionados!');
        playersEmbeds.push(mainEmbed);
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

    return [playersEmbeds, teamsEmbed, turnOrderEmbed];
}

export function createCaptainControlPanel(draft) {
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('🕹️ Panel de Control de Capitanes');

    const totalPicks = draft.captains.length * 10;
    if (draft.status === 'seleccion' && draft.selection.currentPick <= totalPicks) {
        const currentCaptainId = draft.selection.order[draft.selection.turn];
        const captain = draft.captains.find(c => c.userId === currentCaptainId);

        embed.setColor('#2ecc71');
        embed.setDescription(
            `**📍 Pick ${draft.selection.currentPick} de ${totalPicks}**\n\n` +
            `⏳ **Turno actual:** ${captain ? `**${captain.teamName}** (${captain.userName})` : 'Desconocido'}\n\n` +
            `Si eres el capitán con el turno, pulsa el botón de abajo. Si no es tu turno, espera.`
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`captain_pick_start:${draft.shortId}`)
                .setLabel('🎯 Es Mi Turno — Elegir Jugador')
                .setStyle(ButtonStyle.Success)
                .setEmoji('👤'),
            new ButtonBuilder()
                .setCustomId(`captain_manage_roster_start:${draft.shortId}`)
                .setLabel('Ver Mi Plantilla')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋')
        );
        return { embeds: [embed], components: [row] };
    }

    if (draft.status === 'finalizado') {
        embed.setColor('#95a5a6');
        embed.setDescription('**✅ La fase de selección ha finalizado.**\nUn administrador debe seleccionar el formato del torneo en el panel de gestión para continuar.');
        return { embeds: [embed], components: [] };
    }


    if (draft.status === 'torneo_generado') {
        embed.setDescription('**El torneo ha sido generado.**\nUsa los botones de abajo para gestionar tu plantilla o consultar jugadores libres.');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`captain_manage_roster_start:${draft.shortId}`)
                .setLabel('Gestionar Mi Plantilla')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋'),
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
        .setTitle(`Gestión de Plantilla: ${team.teamName || team.nombre}`) // Backticks aqui
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
        .setTitle(`ℹ️ Ficha de Datos: ${player.psnId}`) // Backticks aqui
        .setAuthor({ name: player.userName })
        .setThumbnail(await client.users.fetch(player.userId).then(u => u.displayAvatarURL()).catch(() => null));

    const playerWhatsApp = player.whatsapp || (verifiedData ? verifiedData.whatsapp : null) || 'No registrado';

    if (verifiedData) {
        embed.addFields(
            { name: '📋 Datos de Verificación', value: '\u200B' },
            { name: 'ID de Juego', value: `\`${verifiedData.gameId}\``, inline: true },
            { name: 'Twitter', value: verifiedData.twitter ? `\`${verifiedData.twitter}\`` : '`No registrado`', inline: true },
            { name: 'WhatsApp', value: `\`${playerWhatsApp}\``, inline: true }
        );
    } else {
        embed.addFields(
            { name: '📋 Datos de Verificación', value: 'Este usuario no está verificado oficialmente.' },
            { name: 'WhatsApp', value: `\`${playerWhatsApp}\``, inline: true }
        );
    }

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
    const ruleEmbed = ruleEmbeds[step - 1];

    const safeOriginalAction = originalAction || '';
    const isPlayer = safeOriginalAction.includes('player');
    const finalTotalSteps = isPlayer ? 1 : 3;

    ruleEmbed.setFooter({ text: `Paso ${step} de ${finalTotalSteps} - Debes aceptar todas las normas para poder inscribirte.` });

    const row = new ActionRowBuilder().addComponents(
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

export function createTournamentStatusEmbed(tournament, rulesUrl = PDF_RULES_URL) {
    const format = tournament.config.format;
    const teamsCount = Object.keys(tournament.teams.aprobados).length;
    let statusIcon = TOURNAMENT_STATUS_ICONS[tournament.status] || '❓';
    if (tournament.status === 'inscripcion_abierta' && teamsCount >= format.size && format.size > 0) {
        statusIcon = TOURNAMENT_STATUS_ICONS['cupo_lleno'];
    }

    const embed = new EmbedBuilder()
        .setColor(tournament.status === 'inscripcion_abierta' ? '#2ecc71' : '#3498db')
        .setTitle(`${statusIcon} ${tournament.nombre}`) // Backticks aqui
        .setFooter({ text: `ID del Torneo: ${tournament.shortId}` }); // Backticks aqui

    // --- LÓGICA DINÁMICA DE DESCRIPCIÓN ---
    let formatDescription = TOURNAMENT_FORMATS[tournament.config.formatId].description;

    if (tournament.config.formatId === 'flexible_league') {
        let mode = "🔢 **Personalizado**";
        if (tournament.config.leagueMode === 'all_vs_all' || tournament.config.leagueMode === 'round_robin') {
            mode = "🔄 **Todos contra Todos**";
        } else if (tournament.config.leagueMode === 'custom_rounds') {
            mode = `🇨🇭 **Sistema Suizo (${tournament.config.customRounds} rondas)**`;
        } else if (tournament.config.leagueMode === 'round_robin_custom') {
            mode = `🔢 **Liguilla Personalizada (${tournament.config.customRounds} jornadas)**`;
        }

        const qualifiers = tournament.config.qualifiers === 0
            ? "🏆 **Liga Pura** (Gana el líder, sin eliminatorias)"
            : `🔥 **Eliminatorias:** Clasifican los ${tournament.config.qualifiers} primeros`;

        const legs = tournament.config.matchType === 'idavuelta' ? "Ida y Vuelta" : "Solo Ida";

        formatDescription = `${mode}\n${qualifiers}\n⚙️ **Rondas:** ${legs}`;
    }

    embed.setDescription(formatDescription);
    // --------------------------------------

    if (tournament.config.promoImage) {
        embed.setImage(tournament.config.promoImage);
    }

    embed.addFields(
        { name: 'Formato', value: format.label, inline: true },
        { name: 'Rondas', value: tournament.config.matchType === 'idavuelta' ? 'Ida y Vuelta' : 'Solo Ida', inline: true },
        { name: 'Equipos', value: `${teamsCount} / ${format.size === 0 ? '∞' : format.size}`, inline: true } // Backticks aqui
    );

    if (tournament.config.isPaid) {
        embed.addFields({ name: 'Inscripción', value: `**${tournament.config.entryFee}€**`, inline: true }); // Backticks aqui

        let prizePool = `🏆 **Campeón:** ${tournament.config.prizeCampeon}€`; // Backticks aqui
        if (tournament.config.prizeFinalista > 0) {
            prizePool += `\n🥈 **Finalista:** ${tournament.config.prizeFinalista}€`; // Backticks aqui
        }
        embed.addFields({ name: 'Premios', value: prizePool, inline: true });

        let paymentMethods = '';
        if (tournament.config.paypalEmail) {
            paymentMethods += `\n**PayPal:** \`${tournament.config.paypalEmail}\``; // Backticks aqui
        }
        if (tournament.config.bizumNumber) {
            paymentMethods += `\n**Bizum:** \`${tournament.config.bizumNumber}\``; // Backticks aqui
        }
        if (paymentMethods) {
            embed.addFields({ name: 'Métodos de Pago', value: paymentMethods.trim(), inline: false });
        }

    } else {
        embed.addFields({ name: 'Inscripción', value: 'Gratuito', inline: true });
    }

    if (tournament.config.startTime) {
        embed.addFields({ name: 'Inicio Programado', value: tournament.config.startTime, inline: false });
    }

    // --- MOSTRAR LIGAS PERMITIDAS ---
    if (tournament.config.allowedLeagues && tournament.config.allowedLeagues.length > 0) {
        const leagueDisplay = tournament.config.allowedLeagues.map(l => `${LEAGUE_EMOJIS[l] || ''} ${l}`).join('  |  ');
        embed.addFields({ name: 'Ligas Permitidas / Allowed Leagues', value: leagueDisplay, inline: false });
    }
    // --- FIN LIGAS PERMITIDAS ---

    // --- ESTADO INSCRIPCIONES (DRAFT EXTERNO) ---
    if (tournament.config && tournament.config.paidSubType === 'draft') {
        const playersStatus = tournament.registrationsClosed === true ? '🔴 Cerradas' : '🟢 Abiertas';
        const captainsStatus = tournament.config.registrationClosed === true ? '🔴 Cerradas' : '🟢 Abiertas';
        
        embed.addFields({
            name: 'Estado de Inscripciones',
            value: `**Jugadores (Web):** ${playersStatus}\n**Capitanes (Discord):** ${captainsStatus}`,
            inline: false
        });
    }
    // --- FIN ESTADO INSCRIPCIONES ---

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    const isFull = format.size > 0 && teamsCount >= format.size;

    if (tournament.status === 'inscripcion_abierta') {
        if (!isFull) {
            row1.addComponents(new ButtonBuilder().setCustomId(`inscribir_equipo_start:${tournament.shortId}`).setLabel('Inscribirme').setStyle(ButtonStyle.Success).setEmoji('📝'));
        } else if (!tournament.config.isPaid) {
            row1.addComponents(new ButtonBuilder().setCustomId(`inscribir_reserva_start:${tournament.shortId}`).setLabel('Inscribirme en Reserva').setStyle(ButtonStyle.Primary).setEmoji('📋'));
        }
        row1.addComponents(new ButtonBuilder().setCustomId(`darse_baja_start:${tournament.shortId}`).setLabel('Darse de Baja').setStyle(ButtonStyle.Danger).setEmoji('👋'));
    }

    const finalRulesUrl = tournament.config.customRulesUrl || rulesUrl;
    row2.addComponents(
        new ButtonBuilder().setCustomId(`user_view_participants:${tournament.shortId}`).setLabel('Ver Participantes').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
        new ButtonBuilder().setLabel('Normas').setStyle(ButtonStyle.Link).setURL(finalRulesUrl).setEmoji('📖')
    );

    if (tournament.status === 'finalizado') {
        embed.setColor('#95a5a6').setTitle(`🏁 ${tournament.nombre} (Finalizado)`); // Backticks aqui
    }

    const components = [];
    if (row1.components.length > 0) components.push(row1);
    if (row2.components.length > 0) components.push(row2);

    return { embeds: [embed], components };
}

export function createTeamListEmbed(tournament) {
    const approvedTeams = Object.values(tournament.teams.aprobados);
    const format = tournament.config.format;
    let description = '🇪🇸 Aún no hay equipos inscritos.\n🇬🇧 No teams have registered yet.';

    if (approvedTeams.length > 0) {
        description = approvedTeams.map((team, index) => {
            let teamString = `${index + 1}. **${team.nombre}** (Cap: ${team.capitanTag}`; // Backticks aqui
            if (team.coCaptainTag) {
                teamString += `, Co-Cap: ${team.coCaptainTag}`; // Backticks aqui
            }
            teamString += `, EAFC: \`${team.eafcTeamName}\`)`; // Backticks aqui
            return teamString;
        }).join('\n');
    }

    const embed = new EmbedBuilder().setColor('#1abc9c').setTitle(`📋 Equipos Inscritos - ${tournament.nombre}`).setDescription(description).setFooter({ text: `Total: ${approvedTeams.length} / ${format.size}` }); // Backticks aqui
    return { embeds: [embed] };
}

export function createClassificationEmbed(tournament) {
    const embed = new EmbedBuilder().setColor('#1abc9c').setTitle(`📊 Clasificación / Ranking`).setTimestamp();
    if (Object.keys(tournament.structure.grupos).length === 0) {
        embed.setDescription('🇪🇸 La clasificación se mostrará aquí una vez que comience el torneo.\n🇬🇧 The ranking will be displayed here once the tournament starts.');
        return { embeds: [embed] };
    }
    const sortTeams = (a, b, groupName) => {
        if ((a.stats.pts || 0) !== (b.stats.pts || 0)) return (b.stats.pts || 0) - (a.stats.pts || 0);

        // --- TIE-BREAKS PARA SISTEMA SUIZO ---
        if (tournament.config.formatId === 'flexible_league' && tournament.config.leagueMode === 'custom_rounds') {
            if ((a.stats.buchholz || 0) !== (b.stats.buchholz || 0)) return (b.stats.buchholz || 0) - (a.stats.buchholz || 0);
        }
        // -------------------------------------

        if ((a.stats.dg || 0) !== (b.stats.dg || 0)) return (b.stats.dg || 0) - (a.stats.dg || 0);
        if ((a.stats.gf || 0) !== (b.stats.gf || 0)) return (b.stats.gf || 0) - (a.stats.gf || 0);
        const enfrentamiento = tournament.structure.calendario[groupName]?.find(p => p.resultado && ((p.equipoA.id === a.id && p.equipoB.id === b.id) || (p.equipoA.id === b.id && p.equipoB.id === a.id)));
        if (enfrentamiento) {
            const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
            if (enfrentamiento.equipoA.id === a.id) { if (golesA > golesB) return -1; if (golesB > golesA) return 1; }
            else { if (golesB > golesA) return -1; if (golesA > golesB) return 1; }
        }

        if ((a.stats.pg || 0) !== (b.stats.pg || 0)) return (b.stats.pg || 0) - (a.stats.pg || 0);

        // Validar que ambos nombres existan antes de comparar
        if (!a.nombre || !b.nombre) {
            console.warn('[SORT WARNING] Equipo con nombre null detectado:', { a: a?.nombre, b: b?.nombre });
            return (!a.nombre ? 1 : -1); // NULL va al final
        }
        return a.nombre.localeCompare(b.nombre);
    };
    const sortedGroups = Object.keys(tournament.structure.grupos).sort();
    const isSwiss = tournament.config.formatId === 'flexible_league' && tournament.config.leagueMode === 'custom_rounds';

    for (const groupName of sortedGroups) {
        const grupo = tournament.structure.grupos[groupName];
        const equiposOrdenados = [...grupo.equipos].sort((a, b) => sortTeams(a, b, groupName));
        const nameWidth = 16;
        const header = isSwiss
            ? "EQUIPO/TEAM".padEnd(nameWidth) + "PJ  V  PTS  BH  GF  GC   DG"
            : "EQUIPO/TEAM".padEnd(nameWidth) + "PJ  V  PTS  GF  GC   DG";

        let currentFieldText = "";
        let part = 1;

        for (const e of equiposOrdenados) {
            const teamName = e.nombre.slice(0, nameWidth - 1).padEnd(nameWidth);
            const pj = (e.stats.pj || 0).toString().padStart(2);
            const pg = (e.stats.pg || 0).toString().padStart(1);
            const pts = (e.stats.pts || 0).toString().padStart(3);
            const gf = (e.stats.gf || 0).toString().padStart(3);
            const gc = (e.stats.gc || 0).toString().padStart(3);
            const dgVal = (e.stats.dg || 0);
            const dg = (dgVal >= 0 ? '+' : '') + dgVal.toString();
            const paddedDg = dg.padStart(4);

            let row;
            if (isSwiss) {
                const bh = (e.stats.buchholz || 0).toString().padStart(3);
                row = `${teamName}${pj}  ${pg}  ${pts}  ${bh}  ${gf}  ${gc}  ${paddedDg}\n`;
            } else {
                row = `${teamName}${pj}  ${pg}  ${pts}  ${gf}  ${gc}  ${paddedDg}\n`;
            }

            if (currentFieldText.length + row.length > 900) {
                embed.addFields({
                    name: part === 1 ? `**${groupName}**` : `**${groupName} (Parte ${part})**`,
                    value: "```\n" + header + "\n" + currentFieldText.trim() + "\n```"
                });
                currentFieldText = row;
                part++;
            } else {
                currentFieldText += row;
            }
        }

        if (currentFieldText.length > 0) {
            embed.addFields({
                name: part === 1 ? `**${groupName}**` : `**${groupName} (Parte ${part})**`,
                value: "```\n" + header + "\n" + currentFieldText.trim() + "\n```"
            });
        }
    }

    // ── MEJOR(ES) TERCERO(S) EN TIEMPO REAL (solo para formatos con bestThirds) ──
    const format = tournament.config?.format;
    if (format?.bestThirds > 0 && tournament.status === 'fase_de_grupos') {
        const thirds = [];
        for (const groupName of sortedGroups) {
            const grupo = tournament.structure.grupos[groupName];
            if (!grupo) continue;
            const sorted = [...grupo.equipos].sort((a, b) => sortTeams(a, b, groupName));
            if (sorted[2]) thirds.push({ team: sorted[2], group: groupName });
        }
        thirds.sort((a, b) => {
            const sA = a.team.stats, sB = b.team.stats;
            if (sB.pts !== sA.pts) return sB.pts - sA.pts;
            if (sB.dg !== sA.dg) return sB.dg - sA.dg;
            return sB.gf - sA.gf;
        });
        if (thirds.length > 0) {
            const nameW = 14;
            const header = 'EQUIPO/TEAM'.padEnd(nameW) + 'GRP  PTS  GF  GC   DG';
            let text = '';
            thirds.forEach(({ team: e, group }, i) => {
                const qualifying = i < format.bestThirds;
                const marker = qualifying ? '✅' : '❌';
                const name = e.nombre.slice(0, nameW - 1).padEnd(nameW);
                const grp = group.replace('Grupo ', '').padStart(3);
                const pts = (e.stats.pts || 0).toString().padStart(3);
                const gf = (e.stats.gf || 0).toString().padStart(3);
                const gc = (e.stats.gc || 0).toString().padStart(3);
                const dg = ((e.stats.dg || 0) >= 0 ? '+' : '') + (e.stats.dg || 0);
                text += `${marker} ${name}${grp}  ${pts}  ${gf}  ${gc}  ${dg.padStart(4)}\n`;
            });
            embed.addFields({
                name: `🔶 Mejores Terceros (${format.bestThirds} clasifican a cuartos)`,
                value: '```\n' + header + '\n' + text.trim() + '\n```'
            });
        }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    return { embeds: [embed] };
}

// --- FUNCIÓN DE CALENDARIO MEJORADA CON PAGINACIÓN ---
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

    if (hasGroupStage) {
        const sortedGroups = Object.keys(tournament.structure.calendario).sort();
        for (const groupName of sortedGroups) {
            const partidosDelGrupo = tournament.structure.calendario[groupName];

            // 1. Agrupamos partidos por jornada
            const partidosPorJornada = {};
            for (const partido of partidosDelGrupo) {
                if (!partidosPorJornada[partido.jornada]) {
                    partidosPorJornada[partido.jornada] = [];
                }
                partidosPorJornada[partido.jornada].push(partido);
            }

            // 2. Variables para controlar la paginación
            let currentFieldText = '';
            let part = 1;
            const nameWidth = 15, centerWidth = 6;

            const roundNumbers = Object.keys(partidosPorJornada).sort((a, b) => a - b);

            // Limitar a las primeras 5 jornadas para evitar exceder el límite de 6000 caracteres
            const MAX_ROUNDS_TO_SHOW = 5;
            const roundsToShow = roundNumbers.slice(0, MAX_ROUNDS_TO_SHOW);
            const hiddenRoundsCount = roundNumbers.length - roundsToShow.length;

            for (const jornadaNum of roundsToShow) {
                const roundHeader = `Jornada / Round ${jornadaNum}\n`;
                const matchLines = [];

                for (const partido of partidosPorJornada[jornadaNum]) {
                    const centerText = partido.resultado ? partido.resultado : 'vs';
                    const paddingTotal = centerWidth - centerText.length;
                    const paddingInicio = Math.ceil(paddingTotal / 2);
                    const paddingFin = Math.floor(paddingTotal / 2);
                    const paddedCenter = ' '.repeat(paddingInicio) + centerText + ' '.repeat(paddingFin);
                    const equipoA = partido.equipoA.nombre.slice(0, nameWidth).padEnd(nameWidth);
                    const equipoB = partido.equipoB.nombre.slice(0, nameWidth).padStart(nameWidth);
                    matchLines.push(`${equipoA}${paddedCenter}${equipoB}`);
                }

                // 3. PAGINACIÓN INTRA-JORNADA: Añadimos partido a partido,
                // y si se excede el límite, cortamos el campo y abrimos otro.
                // Esto maneja jornadas con 36+ partidos que exceden 1024 chars por sí solas.
                const MAX_FIELD_CHARS = 900; // margen de seguridad vs límite real de 1024
                let isFirstChunkOfRound = true;

                for (const line of matchLines) {
                    const lineWithNewline = line + '\n';
                    const headerToAdd = isFirstChunkOfRound ? roundHeader : '';
                    const textToAdd = headerToAdd + lineWithNewline;

                    // Si añadir esta línea excede el límite, cerramos el campo actual
                    if (currentFieldText.length > 0 && currentFieldText.length + textToAdd.length > MAX_FIELD_CHARS) {
                        embed.addFields({
                            name: part === 1 ? `**${groupName}**` : `**${groupName} (Parte ${part})**`,
                            value: `\`\`\`\n${currentFieldText.trim()}\n\`\`\``
                        });
                        currentFieldText = '';
                        part++;
                        // Si cortamos a mitad de jornada, añadimos continuación del header
                        if (!isFirstChunkOfRound) {
                            currentFieldText = `Jornada / Round ${jornadaNum} (cont.)\n` + lineWithNewline;
                        } else {
                            currentFieldText = textToAdd;
                        }
                    } else {
                        currentFieldText += textToAdd;
                    }
                    isFirstChunkOfRound = false;
                }
            }

            // 4. Añadimos indicador de jornadas ocultas si hay
            if (hiddenRoundsCount > 0) {
                currentFieldText += `\n... y ${hiddenRoundsCount} jornadas más.\n🌐 Ver calendario completo: https://theblitzvpg.com/visualizer\n`;
            }

            // 5. Añadimos lo que quede en el buffer al final del bucle
            if (currentFieldText.length > 0) {
                embed.addFields({
                    name: part === 1 ? `**${groupName}**` : `**${groupName} (Parte ${part})**`, // Backticks aqui
                    value: `\`\`\`\n${currentFieldText.trim()}\n\`\`\`` // Backticks aqui
                });
            }
        }
    }

    if (hasKnockoutStage) {
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
                stageScheduleText += `${equipoA}${paddedCenter}${equipoB}\n`; // Backticks aqui
            }

            if (stageScheduleText) {
                embed.addFields({ name: `**${stageName}**`, value: `\`\`\`\n${stageScheduleText.trim()}\n\`\`\`` }); // Backticks aqui
            }
        }
    }

    return { embeds: [embed] };
}

export function createCasterInfoEmbed(teamData, tournament) {
    const embed = new EmbedBuilder()
        .setColor('#1abc9c')
        .setTitle(`📢 Nuevo Equipo Inscrito: ${teamData.nombre}`) // Backticks aqui
        .setAuthor({ name: `Torneo: ${tournament.nombre}` }) // Backticks aqui
        .addFields(
            { name: 'Capitán', value: teamData.capitanTag, inline: true },
            { name: 'ID Capitán', value: `\`${teamData.capitanId}\``, inline: true }, // Backticks aqui
            { name: 'Twitter', value: teamData.twitter ? `[Ver Twitter](${teamData.twitter.startsWith('http') ? '' : 'https://twitter.com/'}${teamData.twitter})` : 'No proporcionado', inline: true }, // Backticks aqui
            { name: 'Canal de Transmisión', value: teamData.streamChannel || 'No proporcionado', inline: false }
        )
        .setTimestamp();

    return { embeds: [embed] };
}

export function createStreamerWarningEmbed(platform, originalAction, entityId, teamIdOrPosition = 'NONE') {
    const embed = new EmbedBuilder()
        .setColor('#E67E22')
        .setTitle('⚠️ ANTES DE RELLENAR EL FORMULARIO IMPORTANTE PARA STREAMERS')
        .addFields(
            {
                name: '🔴 1. EN EL SIGUIENTE FORMULARIO ESCRIBE SOLO TU USUARIO DE STREAM',
                value: '\u200B'
            },
            {
                name: '🔴 2. RETRANSMITE EL TORNEO EN EL CANAL DEL USUARIO QUE PONDRAS',
                value: '\u200B'
            },
            {
                name: '🔴 3. NORMAS DE RETRANSMISION',
                value: 'Para que los casters puedan trabajar, durante tus partidos es **OBLIGATORIO**:\n- **Tener las IDs visibles** en el juego.\n- **Desactivar el audio de los comentaristas** del juego.'
            }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`streamer_warning_accept:${platform}:${originalAction}:${entityId}:${teamIdOrPosition}`) // Backticks aqui
            .setLabel('Entendido, continuar con la inscripción')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId('rules_reject')
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] };
}

// =======================================================
// --- SISTEMA DE BOLSA DE EQUIPOS ---
// =======================================================

export function createPoolEmbed(pool) {
    const teams = Object.values(pool.teams || {});
    const counts = { DIAMOND: 0, GOLD: 0, SILVER: 0, BRONZE: 0 };
    teams.forEach(t => {
        if (counts.hasOwnProperty(t.league)) counts[t.league]++;
        else counts['BRONZE']++;
    });
    const total = teams.length;

    let statusText, embedColor;
    switch (pool.status) {
        case 'paused':
            statusText = '🔒 INSCRIPCIÓN PAUSADA';
            embedColor = '#e74c3c';
            break;
        case 'closed':
            statusText = '🛑 BOLSA CERRADA';
            embedColor = '#95a5a6';
            break;
        default:
            statusText = '🟢 INSCRIPCIÓN ABIERTA';
            embedColor = '#00e5ff';
    }

    // Build ELO filter text
    let eloFilterText = '';
    if (pool.minElo || pool.maxElo) {
        const parts = [];
        if (pool.minElo) parts.push(`Mínimo: ${pool.minElo}`);
        if (pool.maxElo) parts.push(`Máximo: ${pool.maxElo}`);
        eloFilterText = `\n🎯 **Filtro ELO:** ${parts.join(' · ')}\n`;
    }

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`📦 ${pool.name}`)
        .setDescription(
            `${statusText}\n\n` +
            `**${total}** equipos inscritos\n` +
            `💎 ${counts.DIAMOND} Diamond · 👑 ${counts.GOLD} Gold · ⚙️ ${counts.SILVER} Silver · 🥉 ${counts.BRONZE} Bronze\n` +
            eloFilterText + `\n` +
            `🌐 **Inscripción Web:** ${process.env.BASE_URL || 'https://bot-torneos-web.onrender.com'}/bolsa/${pool.shortId}`
        )
        .setFooter({ text: `ID: ${pool.shortId}` })
        .setTimestamp();

    if (pool.imageUrl) embed.setImage(pool.imageUrl);

    const isOpen = pool.status === 'open';
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pool_register:${pool.shortId}`)
            .setLabel('Inscribirse')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(!isOpen),
        new ButtonBuilder()
            .setCustomId(`pool_participants:${pool.shortId}`)
            .setLabel('Ver Participantes')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👥'),
        new ButtonBuilder()
            .setCustomId(`pool_unregister:${pool.shortId}`)
            .setLabel('Darse de Baja')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
            .setDisabled(!isOpen),
        new ButtonBuilder()
            .setLabel('Inscripción Web')
            .setStyle(ButtonStyle.Link)
            .setURL(`${process.env.BASE_URL || 'https://bot-torneos-web.onrender.com'}/bolsa/${pool.shortId}`)
            .setEmoji('🌐')
    );

    return { embeds: [embed], components: [row1] };
}
