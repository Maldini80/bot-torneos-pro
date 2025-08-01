// src/utils/embeds.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { TOURNAMENT_STATUS_ICONS, TOURNAMENT_FORMATS, PDF_RULES_URL, RULES_ACCEPTANCE_IMAGE_URLS, DRAFT_POSITION_ORDER, DRAFT_POSITIONS } from '../../config.js';
import { getBotSettings } from '../../database.js';

export async function createGlobalAdminPanel(isBusy = false) {
    const settings = await getBotSettings();
    const translationEnabled = settings.translationEnabled;

    const embed = new EmbedBuilder()
        .setColor(isBusy ? '#e74c3c' : '#2c3e50')
        .setTitle('Panel de Creación de Torneos y Drafts')
        .setFooter({ text: 'Bot de Torneos v3.0.0' });

    embed.setDescription(isBusy
        ? '🔴 **ESTADO: OCUPADO**\nEl bot está realizando una tarea crítica. Por favor, espera.'
        : `✅ **ESTADO: LISTO**\nTraducción Automática: **${translationEnabled ? 'ACTIVADA' : 'DESACTIVADA'}**\nUsa los botones de abajo para gestionar.`
    );

    const globalActionsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_create_tournament_start').setLabel('Crear Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆').setDisabled(isBusy),
        new ButtonBuilder().setCustomId('admin_create_draft_start').setLabel('Crear Draft').setStyle(ButtonStyle.Primary).setEmoji('📝').setDisabled(isBusy),
        new ButtonBuilder().setCustomId('admin_update_channel_status').setLabel('Estado Canal').setStyle(ButtonStyle.Secondary).setEmoji('🔄').setDisabled(isBusy)
    );

    const globalSettingsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_toggle_translation')
            .setLabel(translationEnabled ? 'Desactivar Traducción' : 'Activar Traducción')
            .setStyle(translationEnabled ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setEmoji(translationEnabled ? '🔇' : '🔊')
            .setDisabled(isBusy),
        new ButtonBuilder().setCustomId('admin_force_reset_bot').setLabel('Reset Forzado').setStyle(ButtonStyle.Danger).setEmoji('🚨')
    );
    
    return { embeds: [embed], components: [globalActionsRow, globalSettingsRow] };
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

    const components = [];
    if (row1.components.length > 0) components.push(row1);
    if (row2.components.length > 0) components.push(row2);
    if (row3.components.length > 0) components.push(row3);

    return { embeds: [embed], components };
}

export function createDraftStatusEmbed(draft) {
    const isRegistrationOpen = draft.status === 'inscripcion';
    const captainCount = draft.captains.length;
    const playerCount = draft.players.length;
    const totalParticipants = captainCount + playerCount;
    
    const embed = new EmbedBuilder()
        .setColor(isRegistrationOpen ? '#5865F2' : '#71368A')
        .setTitle(`📝 Draft: ${draft.name}`)
        .setDescription(draft.config.isPaid ? '**Este es un draft de pago.**' : '**Este es un draft gratuito.**')
        .addFields(
            { name: 'Capitanes / Captains', value: `${captainCount} / 8`, inline: true },
            { name: 'Jugadores / Players', value: `${playerCount} / 80`, inline: true }, // 88 total - 8 capitanes
            { name: 'Total', value: `${totalParticipants} / 88`, inline: true }
        )
        .setFooter({ text: `ID del Draft: ${draft.shortId}` });

    const row = new ActionRowBuilder();
    if (isRegistrationOpen) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`register_draft_captain:${draft.shortId}`)
                .setLabel('Inscribirme como Capitán')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👑')
                .setDisabled(captainCount >= 8),
            new ButtonBuilder()
                .setCustomId(`register_draft_player:${draft.shortId}`)
                .setLabel('Inscribirme como Jugador')
                .setStyle(ButtonStyle.Success)
                .setEmoji('👤')
                // Permitir inscripciones a reserva si la opción está activada
                .setDisabled(totalParticipants >= 88 && !(draft.config.isPaid === false && draft.config.allowReserves))
        );
    } else {
        embed.setDescription(`**Estado actual: ${draft.status.replace(/_/g, ' ')}**`);
    }

    return { embeds: [embed], components: row.components.length > 0 ? [row] : [] };
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
            new ButtonBuilder().setCustomId(`draft_start_selection:${draft.shortId}`).setLabel('Iniciar Selección').setStyle(ButtonStyle.Success).setEmoji('▶️').setDisabled(isBusy),
            new ButtonBuilder().setCustomId(`draft_add_test_players:${draft.shortId}`).setLabel('Añadir Jugadores Test').setStyle(ButtonStyle.Secondary).setEmoji('🧪').setDisabled(isBusy)
        );
    }

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
    
    row2.addComponents(new ButtonBuilder().setCustomId(`draft_end:${draft.shortId}`).setLabel('Finalizar Draft').setStyle(ButtonStyle.Danger).setEmoji('🛑').setDisabled(isBusy));

    const components = [];
    if (row1.components.length > 0) components.push(row1);
    if (row2.components.length > 0) components.push(row2);
    
    return { embeds: [embed], components };
}

export function createDraftMainInterface(draft) {
    const availablePlayers = draft.players.filter(p => !p.captainId);
    
    const playersEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Jugadores Disponibles para Seleccionar')
        .setDescription('Lista de todos los jugadores que aún no han sido elegidos.');
    
    const groupedPlayers = {};
    DRAFT_POSITION_ORDER.forEach(pos => groupedPlayers[pos] = []);
    
    availablePlayers.forEach(player => {
        if (groupedPlayers[player.primaryPosition]) {
            groupedPlayers[player.primaryPosition].push(player.userName);
        }
    });

    for (const position of DRAFT_POSITION_ORDER) {
        const playersInPos = groupedPlayers[position];
        let value = 'No hay jugadores disponibles.';
        if (playersInPos.length > 0) {
            value = '`' + playersInPos.join('`, `') + '`';
        }
        playersEmbed.addFields({ name: `--- ${DRAFT_POSITIONS[position]} ---`, value: value });
    }

    const teamsEmbed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('Equipos del Draft')
        .setDescription('Plantillas actuales de cada equipo.');
        
    draft.captains.forEach(captain => {
        const teamPlayers = draft.players.filter(p => p.captainId === captain.userId);
        const playerList = teamPlayers.map(p => `• ${p.userName} (${p.primaryPosition})`).join('\n');
        teamsEmbed.addFields({
            name: `👑 ${captain.teamName} (Cap: ${captain.userName})`,
            value: teamPlayers.length > 0 ? playerList : '*Vacío*',
            inline: true
        });
    });

    return [playersEmbed, teamsEmbed];
}

export function createDraftPickEmbed(draft, captainId) {
    const captain = draft.captains.find(c => c.userId === captainId);
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`Turno de Selección: ${captain.teamName}`)
        .setDescription(`Es tu turno, <@${captainId}>. Por favor, usa los menús para seleccionar a tu próximo jugador.`)
        .setFooter({text: 'Paso 1: Elige cómo quieres buscar al jugador.'});

    const searchTypeMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`draft_pick_search_type:${draft.shortId}:${captainId}`)
            .setPlaceholder('Buscar por posición...')
            .addOptions([
                { label: 'Posición Primaria', value: 'primary', emoji: '⭐' },
                { label: 'Posición Secundaria', value: 'secondary', emoji: '🔹' }
            ])
    );
    
    return { content: `<@${captainId}>`, embeds: [embed], components: [searchTypeMenu], ephemeral: true };
}

export function createRuleAcceptanceEmbed(step, totalSteps) {
    const imageUrl = RULES_ACCEPTANCE_IMAGE_URLS[step - 1];

    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`📜 Normas del Torneo - Paso ${step} de ${totalSteps}`)
        .setDescription('Por favor, lee las normas en la imagen y pulsa "Aceptar" para continuar.\n*Please read the rules in the image and press "Accept" to continue.*')
        .setImage(imageUrl)
        .setFooter({ text: 'Debes aceptar todas las normas para poder inscribirte.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`rules_accept_step_${step}`)
            .setLabel('Acepto / I Accept')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId('rules_reject')
            .setLabel('Rechazar / Decline')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );

    return { embeds: [embed], components: [row], ephemeral: true };
}

export function createTournamentStatusEmbed(tournament) {
    const format = tournament.config.format;
    const teamsCount = Object.keys(tournament.teams.aprobados).length;
    let statusIcon = TOURNAMENT_STATUS_ICONS[tournament.status] || '❓';
    if (tournament.status === 'inscripcion_abierta' && teamsCount >= format.size) { statusIcon = TOURNAMENT_STATUS_ICONS['cupo_lleno']; }

    const embed = new EmbedBuilder()
        .setColor(tournament.status === 'inscripcion_abierta' ? '#2ecc71' : '#3498db')
        .setTitle(`${statusIcon} ${tournament.nombre}`)
        .addFields( { name: 'Formato / Format', value: format.label, inline: true }, { name: 'Equipos / Teams', value: `${teamsCount} / ${format.size}`, inline: true } )
        .setFooter({ text: `ID del Torneo: ${tournament.shortId}` });

    const formatDescriptionES = TOURNAMENT_FORMATS[tournament.config.formatId].description;
    const formatDescriptionEN = TOURNAMENT_FORMATS[tournament.config.formatId].description_en || formatDescriptionES;

    let descriptionLines = [];

    if (tournament.config.isPaid) {
        descriptionLines.push('**Este es un torneo de pago. / This is a paid tournament.**');
        embed.addFields(
            { name: 'Inscripción / Entry', value: `${tournament.config.entryFee}€`, inline: true },
            { name: '🏆 Premio Campeón / Champion Prize', value: `${tournament.config.prizeCampeon}€`, inline: true }
        );
        if (tournament.config.prizeFinalista > 0) {
            embed.addFields({ name: '🥈 Premio Finalista / Runner-up Prize', value: `${tournament.config.prizeFinalista}€`, inline: true });
        }
    } else {
        descriptionLines.push('**Este es un torneo gratuito. / This is a free tournament.**');
        embed.addFields({ name: 'Entry', value: 'Gratuito / Free', inline: true });
    }

    descriptionLines.push(`\n🇪🇸 ${formatDescriptionES}`);
    descriptionLines.push(`🇬🇧 ${formatDescriptionEN}`);
    embed.setDescription(descriptionLines.join('\n'));

    if (tournament.config.startTime) {
        embed.addFields({ name: 'Inicio Programado / Scheduled Start', value: tournament.config.startTime, inline: false });
    }

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    const isFull = teamsCount >= format.size;

    if (tournament.status === 'inscripcion_abierta') {
        if (!isFull) {
            row1.addComponents(new ButtonBuilder().setCustomId(`inscribir_equipo_start:${tournament.shortId}`).setLabel('Inscribirme / Register').setStyle(ButtonStyle.Success).setEmoji('📝'));
        } else if (!tournament.config.isPaid) {
            row1.addComponents(new ButtonBuilder().setCustomId(`inscribir_reserva_start:${tournament.shortId}`).setLabel('Inscribirme en Reserva / Waitlist').setStyle(ButtonStyle.Primary).setEmoji('📋'));
        }
        row1.addComponents(new ButtonBuilder().setCustomId(`darse_baja_start:${tournament.shortId}`).setLabel('Darse de Baja / Unregister').setStyle(ButtonStyle.Danger).setEmoji('👋'));
    }

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
            const partidosPorJornada = {};
            for (const partido of partidosDelGrupo) { if (!partidosPorJornada[partido.jornada]) partidosPorJornada[partido.jornada] = []; partidosPorJornada[partido.jornada].push(partido); }
            let groupScheduleText = ''; const nameWidth = 15, centerWidth = 6;
            for (const jornadaNum of Object.keys(partidosPorJornada).sort((a, b) => a - b)) {
                groupScheduleText += `Jornada / Round ${jornadaNum}\n`;
                for (const partido of partidosPorJornada[jornadaNum]) {
                    const centerText = partido.resultado ? partido.resultado : 'vs';
                    const paddingTotal = centerWidth - centerText.length; const paddingInicio = Math.ceil(paddingTotal / 2), paddingFin = Math.floor(paddingTotal / 2);
                    const paddedCenter = ' '.repeat(paddingInicio) + centerText + ' '.repeat(paddingFin);
                    const equipoA = partido.equipoA.nombre.slice(0, nameWidth).padEnd(nameWidth);
                    const equipoB = partido.equipoB.nombre.slice(0, nameWidth).padStart(nameWidth);
                    groupScheduleText += `${equipoA}${paddedCenter}${equipoB}\n`;
                }
            }
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
