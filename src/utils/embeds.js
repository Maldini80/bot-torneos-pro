// src/utils/embeds.js.
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { TOURNAMENT_STATUS_ICONS, TOURNAMENT_FORMATS, PDF_RULES_URL, DRAFT_POSITION_ORDER, DRAFT_POSITIONS } from '../../config.js';
import { getBotSettings, getDb } from '../../database.js';

const ruleEmbeds = [
    new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('📜 REGLAMENTO OFICIAL DE PARTIDO')
        .setDescription(
            "A continuación se detallan las normas obligatorias para todos los partidos del torneo. El\n" +
            "desconocimiento de estas reglas no exime de su cumplimiento.\n\n" +
            "👥**11 Jugadores Obligatorios**\n" +
            "Todos los partidos deben jugarse con 11 futbolistas en el campo.\n\n" +
            "🤖**Posición 'Cualquiera' (CLQ)**\n" +
            "No es obligatorio el uso de esta posición.\n\n" +
            "⏱️**Salidas del Partido**\n" +
            "Se permite un máximo de 2 salidas por equipo, siempre y cuando ocurran antes del minuto 10 del\n" +
            "partido. Salir del partido una tercera vez o después del minuto 10 podrá ser sancionado.\n\n" +
            "⏳**Tiempo de Cortesía**\n" +
            "Se establece un tiempo de cortesía de 10 minutos desde la hora oficial del partido. Pasado este\n" +
            "tiempo, si un equipo no está listo, el rival podrá reclamar la victoria (presentando pruebas de la\n" +
            "espera). La sanción por incumplimiento es la pérdida del partido por 1-0.\n\n" +
            "📏**Límites de Altura**\n" +
            "Se deben respetar los siguientes límites de altura para los jugadores virtuales:\n" +
            "• Defensas Centrales (DFC/CB): Máximo 6'2\" / 187cm.\n" +
            "• Resto de Jugadores de Campo: Máximo 5'10\" / 177cm.\n" +
            "• Portero (POR/GK): Sin límite de altura.\n\n" +
            "🚫**PlayStyles Prohibidos**\n" +
            "Quedan totalmente prohibidos los siguientes PlayStyles, tanto en su versión de plata como de oro:\n" +
            "• AÉREO (Aerial)\n" +
            "• ANTICIPACIÓN (Anticipate / \"Mapache\")\n\n" +
            "**NOTA: Para saber cómo proceder después de un partido (reportar resultados, solicitar pruebas,\n" +
            "etc.), consulta la Guía de Reportes y Pruebas.**"
        ),
    new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('📋 GUÍA DE REPORTES, PRUEBAS Y DISPUTAS')
        .setDescription(
            "Para garantizar la integridad y la fluidez del torneo, es obligatorio que ambos capitanes o sus co-capitanes sigan este\n" +
            "procedimiento después de cada partido.\n\n" +
            "**Paso 1: Jugar el Partido y Preparar las Pruebas**\n" +
            "En cada encuentro, ambos capitanes o sus co-capitanes deben grabar un clip durante el partido por si el rival lo\n" +
            "solicitara. Este clip debe mostrar claramente el vestíbulo final donde se vean TODOS los jugadores\n" +
            "del equipo, sus alturas y sus PlayStyles/Perks, y el partido que estan disputando.\n" +
            "• **Importante:** No es necesario presentar este clip si no se solicita, pero es vuestra\n" +
            "responsabilidad tenerlo preparado.\n\n" +
            "**Paso 2: Reportar el Resultado (Procedimiento Estándar)**\n" +
            "El procedimiento habitual se basa en la confianza y la deportividad.\n" +
            "1. Al finalizar el partido, ambos capitanes debéis pulsar el botón 'Reportar Resultado' en el\n" +
            "hilo del partido.\n" +
            "2. Introducid el marcador final.\n" +
            "• **Si los resultados coinciden:** ¡Perfecto! El sistema validará el resultado, actualizará\n" +
            "las clasificaciones y el hilo del partido se cerrará y eliminará. No se necesita\n" +
            "hacer nada más.\n\n" +
            "**Paso 3: Gestión de Pruebas (SOLO si hay sospechas)**\n" +
            "• **Solicitud de Pruebas:** Si durante o después del partido sospechas que tu rival ha\n" +
            "incumplido alguna norma, debes solicitarle las pruebas a través del chat del hilo del\n" +
            "partido.\n" +
            "• **Presentación de Pruebas:** Al ser solicitadas, el equipo rival está OBLIGADO a presentar el\n" +
            "clip que grabó. Para ello, debe:\n" +
            "1. Usar el botón 'Prueba de altura perks' que le llevará a Streamable.com para subir\n" +
            "el vídeo.\n" +
            "2. Pegar el enlace de Streamable (o de YouTube/Twitch) en el hilo del partido.\n\n" +
            "**Paso 4: Revisión y Disputa**\n" +
            "Una vez las pruebas son subidas, el capitán que las solicitó debe revisarlas.\n" +
            "• **Si todo es correcto,** ambos equipos deben proceder a reportar el resultado como se indica\n" +
            "en el Paso 2.\n" +
            "• **Si detectas una irregularidad,** ahora es el momento de pulsar el botón 'Solicitar Arbitraje'\n" +
            "y explicar el problema a los árbitros en el hilo."
        ),
    new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('⚠️ SANCIONES POR INCUMPLIMIENTO')
        .setDescription(
            "Las siguientes acciones conllevarán sanciones directas:\n\n" +
            "• **Incumplimiento del Tiempo de Cortesía:**\n" +
            "• **Consecuencia:** Partido perdido 1-0.\n\n" +
            "• **Pruebas que Demuestran una Infracción (Altura/Perk Ilegal):**\n" +
            "• **Consecuencia:** Partido perdido 3-0.\n\n" +
            "• **No Presentar Pruebas (Cuando son solicitadas):**\n" +
            "• **Torneo de Pago:** Consecuencia: Partido perdido 3-0.\n" +
            "• **Torneo Gratuito:**\n" +
            "• **1ª Vez:** El caso quedará bajo supervisión de un árbitro. Se podrá quedar en\n" +
            "\"advertencia oficial\" si hay consenso con el rival; de lo contrario, se\n" +
            "dictaminará el partido como perdido.\n" +
            "• **2ª Vez:** Consecuencia: Expulsión del torneo. Además, el capitán no podrá\n" +
            "participar en más torneos gratuitos de VPG hasta que su caso sea revisado\n" +
            "por el Staff."
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
                new ButtonBuilder().setCustomId('admin_create_tournament_start').setLabel('Crear Nuevo Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆').setDisabled(isBusy)
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
            { name: 'Capitanes / Captains', value: `${captainCount} / 8`, inline: true },
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
         row1.addComponents(
            new ButtonBuilder().setCustomId(`draft_force_tournament:${draft.shortId}`).setLabel('Forzar Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆').setDisabled(isBusy)
        );
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

    if (teamFields[0].length > 0) teamsEmbed.addFields({ name: '\u200B', value: teamFields[0].join('\n\n'), inline: true });
    if (teamFields[1].length > 0) teamsEmbed.addFields({ name: '\u200B', value: teamFields[1].join('\n\n'), inline: true });
    if (teamFields[2].length > 0) teamsEmbed.addFields({ name: '\u200B', value: teamFields[2].join('\n\n'), inline: true });

    const turnOrderEmbed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🐍 Orden de Selección del Draft');

    if (draft.status === 'seleccion' && draft.selection.order.length > 0) {
        const picksList = [];
        const totalPicks = 80;
        const numCaptains = draft.selection.order.length;
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

    if (draft.status === 'seleccion' && draft.selection.currentPick <= 80) {
        const currentCaptainId = draft.selection.order[draft.selection.turn];
        const captain = draft.captains.find(c => c.userId === currentCaptainId);

        embed.setDescription(`Es el turno de <@${currentCaptainId}> para el equipo **${captain.teamName}**.\n\n*Solo el capitán del turno (o un admin) puede usar los botones.*`);
        embed.setFooter({ text: `Pick #${draft.selection.currentPick} de 80` });

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
    const ruleEmbed = ruleEmbeds[step - 1];
    
    // --- LÓGICA DE ROBUSTEZ AÑADIDA ---
    // Aseguramos que originalAction sea siempre un string para evitar errores.
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
        .setFooter({ text: `ID del Torneo: ${tournament.shortId}` });

    // --- LÓGICA MODIFICADA PARA UN SOLO IDIOMA Y MÁS CLARIDAD ---

    const formatDescription = TOURNAMENT_FORMATS[tournament.config.formatId].description;
    embed.setDescription(formatDescription);

    embed.addFields(
        { name: 'Formato', value: format.label, inline: true },
        { name: 'Rondas', value: tournament.config.matchType === 'idavuelta' ? 'Ida y Vuelta' : 'Solo Ida', inline: true },
        { name: 'Equipos', value: `${teamsCount} / ${format.size}`, inline: true }
    );

    if (tournament.config.isPaid) {
        embed.addFields({ name: 'Inscripción', value: `**${tournament.config.entryFee}€**`, inline: true });
        
        let prizePool = `🏆 **Campeón:** ${tournament.config.prizeCampeon}€`;
        if (tournament.config.prizeFinalista > 0) {
            prizePool += `\n🥈 **Finalista:** ${tournament.config.prizeFinalista}€`;
        }
        embed.addFields({ name: 'Premios', value: prizePool, inline: true });

        // Añadimos los métodos de pago si existen
        let paymentMethods = '';
        if (tournament.config.paypalEmail) {
            paymentMethods += `\n**PayPal:** \`${tournament.config.paypalEmail}\``;
        }
        if (tournament.config.bizumNumber) {
            paymentMethods += `\n**Bizum:** \`${tournament.config.bizumNumber}\``;
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
    
    // El resto de la lógica de los botones permanece igual
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    const isFull = teamsCount >= format.size;

    if (tournament.status === 'inscripcion_abierta') {
        if (!isFull) {
            row1.addComponents(new ButtonBuilder().setCustomId(`inscribir_equipo_start:${tournament.shortId}`).setLabel('Inscribirme').setStyle(ButtonStyle.Success).setEmoji('📝'));
        } else if (!tournament.config.isPaid) {
            row1.addComponents(new ButtonBuilder().setCustomId(`inscribir_reserva_start:${tournament.shortId}`).setLabel('Inscribirme en Reserva').setStyle(ButtonStyle.Primary).setEmoji('📋'));
        }
        row1.addComponents(new ButtonBuilder().setCustomId(`darse_baja_start:${tournament.shortId}`).setLabel('Darse de Baja').setStyle(ButtonStyle.Danger).setEmoji('👋'));
    }

    row2.addComponents(
        new ButtonBuilder().setCustomId(`user_view_participants:${tournament.shortId}`).setLabel('Ver Participantes').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
        new ButtonBuilder().setLabel('Normas').setStyle(ButtonStyle.Link).setURL(PDF_RULES_URL).setEmoji('📖')
    );

    if (tournament.status === 'finalizado') {
        embed.setColor('#95a5a6').setTitle(`🏁 ${tournament.nombre} (Finalizado)`);
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
        .setTitle(`📢 Nuevo Equipo Inscrito: ${teamData.nombre}`)
        .setAuthor({ name: `Torneo: ${tournament.nombre}`})
        .addFields(
            { name: 'Capitán', value: teamData.capitanTag, inline: true },
            { name: 'ID Capitán', value: `\`${teamData.capitanId}\``, inline: true },
            { name: 'Twitter', value: teamData.twitter ? `[Ver Twitter](${teamData.twitter.startsWith('http') ? '' : 'https://twitter.com/'}${teamData.twitter})` : 'No proporcionado', inline: true },
            { name: 'Canal de Transmisión', value: teamData.streamChannel || 'No proporcionado', inline: false }
        )
        .setTimestamp();

    return { embeds: [embed] };
}
    
/**
 * NUEVO: Crea el embed de advertencia para capitanes sobre la importancia de su stream.
 */
export function createStreamerWarningEmbed(platform, originalAction, entityId, teamIdOrPosition = 'NONE') {
    const embed = new EmbedBuilder()
        .setColor('#E67E22') // Naranja de advertencia
        .setTitle('⚠️ ¡ATENCIÓN, CAPITÁN! INSTRUCCIONES IMPORTANTES')
        .setDescription('**Leer esto es OBLIGATORIO. El correcto funcionamiento del torneo y de la retransmisión depende de ello.**')
        .addFields(
            {
                name: '🔴 1. Tu Usuario de Stream',
                value: 'Asegúrate de escribir tu nombre de usuario de **' + platform + '** **EXACTAMENTE** como es. Sin errores, sin mayúsculas/minúsculas incorrectas y sin la URL completa. Solo el nombre de usuario.'
            },
            {
                name: '🔴 2. El Canal Correcto',
                value: 'Debes proporcionar el canal que **REALMENTE USARÁS** para retransmitir tus partidos del torneo. No pongas un canal secundario o uno que no uses.'
            },
            {
                name: '✅ 3. Normas de Retransmisión',
                value: 'Para que los casters puedan trabajar, durante tus partidos es **OBLIGATORIO**:\n- **Tener las IDs visibles** en el juego.\n- **Desactivar el audio de los comentaristas** del juego.'
            },
            {
                name: '🚫 Consecuencias',
                value: 'Proporcionar información incorrecta de forma repetida impedirá tu participación como capitán en futuros torneos. **Esta información es VITAL para los casters y el visualizador en vivo.**'
            }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            // CORRECCIÓN: El customId ahora pasa los parámetros de forma limpia.
            .setCustomId(`streamer_warning_accept:${platform}:${originalAction}:${entityId}:${teamIdOrPosition}`)
            .setLabel('Entendido, continuar con la inscripción')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId('rules_reject') // Reutilizamos el botón de rechazo
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Danger)
    );
    
    return { embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] };
}
