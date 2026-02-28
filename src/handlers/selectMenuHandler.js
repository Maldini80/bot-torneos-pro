
// --- INICIO DEL ARCHIVO selectMenuHandler.js (VERSIÓN REPARADA) ---

import { getDb } from '../../database.js';
import { ObjectId } from 'mongodb';
import { TOURNAMENT_FORMATS, DRAFT_POSITIONS } from '../../config.js';
import { ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { updateTournamentConfig, addCoCaptain, createNewDraft, handlePlayerSelection, createTournamentFromDraft, kickPlayerFromDraft, inviteReplacementPlayer, approveTeam, updateDraftMainInterface, updatePublicMessages, notifyVisualizer, kickTeam, notifyTournamentVisualizer } from '../logic/tournamentLogic.js';
import { handlePlatformSelection, handlePCLauncherSelection, handleProfileUpdateSelection, checkVerification } from '../logic/verificationLogic.js';
import { setChannelIcon } from '../utils/panelManager.js';
import { createTeamRosterManagementEmbed, createPlayerManagementEmbed } from '../utils/embeds.js';
import { createMatchThread } from '../utils/tournamentUtils.js';
import { processMatchResult, findMatch, finalizeMatchThread, revertStats } from '../logic/matchLogic.js';

export async function handleSelectMenu(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();

    const [action, ...params] = customId.split(':');

    // =======================================================
    // --- LÓGICA DE VERIFICACIÓN Y GESTIÓN DE PERFIL ---
    // =======================================================

    if (action === 'verify_select_platform' || action === 'verify_select_platform_manual') {
        await handlePlatformSelection(interaction);
        return;
    }

    if (action === 'verify_select_pc_launcher') {
        await handlePCLauncherSelection(interaction);
        return;
    }

    if (action === 'update_profile_select_field') {
        await handleProfileUpdateSelection(interaction);
        return;
    }

    // --- FIN DE LA NUEVA LÓGICA ---
    if (action === 'admin_select_replacement_position' || action === 'admin_select_replacement_page') {
        await interaction.deferUpdate();
        const [draftShortId, teamId, kickedPlayerId, position, pageStr] = params;
        const page = action === 'admin_select_replacement_page' ? parseInt(interaction.values[0].replace('page_', '')) : 0;
        const selectedPosition = action === 'admin_select_replacement_position' ? interaction.values[0] : position;

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const freeAgents = draft.players.filter(p => !p.captainId && !p.isCaptain);

        let candidates = freeAgents.filter(p => p.primaryPosition === selectedPosition);
        if (candidates.length === 0) {
            candidates = freeAgents.filter(p => p.secondaryPosition === selectedPosition);
        }

        if (candidates.length === 0) {
            return interaction.editReply({
                content: `No se encontraron agentes libres para la posición **${DRAFT_POSITIONS[selectedPosition]}**.`,
                components: []
            });
        }

        candidates.sort((a, b) => a.psnId.localeCompare(b.psnId));
        const pageSize = 25;
        const pageCount = Math.ceil(candidates.length / pageSize);
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        const candidatesPage = candidates.slice(startIndex, endIndex);

        const playerOptions = candidatesPage.map(p => ({
            label: p.psnId,
            description: `Pos: ${p.primaryPosition} / ${p.secondaryPosition || 'N/A'}`,
            value: p.userId
        }));

        const playerMenu = new StringSelectMenuBuilder()
            .setCustomId(`captain_invite_replacement_select:${draftShortId}:${teamId}:${kickedPlayerId}`)
            .setPlaceholder(`Pág. ${page + 1}/${pageCount} - Selecciona un jugador`)
            .addOptions(playerOptions);

        const components = [new ActionRowBuilder().addComponents(playerMenu)];

        if (pageCount > 1) {
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                pageOptions.push({
                    label: `Página ${i + 1} de ${pageCount}`,
                    value: `page_${i}`
                });
            }
            const pageMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_select_replacement_page:${draftShortId}:${teamId}:${kickedPlayerId}:${selectedPosition}`)
                .setPlaceholder('Cambiar de página')
                .addOptions(pageOptions);
            components.unshift(new ActionRowBuilder().addComponents(pageMenu));
        }

        await interaction.editReply({
            content: `Mostrando agentes libres para **${DRAFT_POSITIONS[selectedPosition]}**. Hay un total de ${candidates.length} jugadores.`,
            components
        });
        return;
    }

    // =======================================================
    // --- REPARACIÓN SELECTIVA DE HILOS ---
    // =======================================================

    if (action === 'admin_select_team_for_thread_repair') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const teamId = interaction.values[0];

        try {
            const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
            if (!tournament) {
                return interaction.editReply({ content: '❌ No se encontró el torneo.', components: [] });
            }

            const team = tournament.teams.aprobados[teamId];
            if (!team) {
                return interaction.editReply({ content: '❌ No se encontró el equipo.', components: [] });
            }

            // Buscar todos los partidos del equipo en estructura.calendario
            const matchesNeedingRepair = [];

            if (tournament.structure.calendario) {
                for (const [groupName, matches] of Object.entries(tournament.structure.calendario)) {
                    for (const match of matches) {
                        // Verificar que el partido pertenece al equipo
                        if (match.equipoA.id !== teamId && match.equipoB.id !== teamId) continue;

                        // Saltar partidos finalizados o BYE
                        if (match.status === 'finalizado' || match.equipoB?.id === 'ghost') continue;

                        let needsRepair = false;
                        let repairReason = '';

                        if (!match.threadId) {
                            // Caso 1: No tiene threadId en DB
                            needsRepair = true;
                            repairReason = 'SIN HILO';
                        } else {
                            // Caso 2: Tiene threadId, verificar si existe en Discord
                            try {
                                await client.channels.fetch(match.threadId);
                                // Si llegamos aquí, el hilo existe, no necesita reparación
                            } catch (error) {
                                // El hilo no existe en Discord
                                needsRepair = true;
                                repairReason = 'HILO PERDIDO';
                            }
                        }

                        if (needsRepair) {
                            const rivalName = match.equipoA.id === teamId ? match.equipoB.nombre : match.equipoA.nombre;
                            matchesNeedingRepair.push({
                                matchId: match.matchId,
                                groupName,
                                rivalName,
                                jornada: match.jornada,
                                reason: repairReason
                            });
                        }
                    }
                }
            }

            if (matchesNeedingRepair.length === 0) {
                return interaction.editReply({
                    content: `✅ Todos los partidos de **${team.nombre}** tienen hilos válidos. No hay nada que reparar.`,
                    components: []
                });
            }

            // Ordenar por jornada
            matchesNeedingRepair.sort((a, b) => a.jornada - b.jornada);

            // Limitar a 25 (límite de Discord)
            const matchesToShow = matchesNeedingRepair.slice(0, 25);

            const matchOptions = matchesToShow.map(m => ({
                label: `${m.groupName} - vs ${m.rivalName} - J${m.jornada}`,
                description: `⚠️ ${m.reason}`,
                value: m.matchId,
                emoji: m.reason === 'SIN HILO' ? '❌' : '🔧'
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`admin_select_match_for_repair:${tournamentShortId}`)
                .setPlaceholder('Selecciona el partido a reparar')
                .addOptions(matchOptions);

            await interaction.editReply({
                content: `🔧 **Partidos de ${team.nombre} que necesitan reparación:**\n\nEncontrados: **${matchesNeedingRepair.length}** partido(s)\nSelecciona cuál reparar:`,
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
        } catch (error) {
            console.error('[THREAD REPAIR]', error);
            await interaction.editReply({
                content: `❌ Error al buscar partidos: ${error.message}`,
                components: []
            });
        }
        return;
    }

    if (action === 'admin_select_match_for_repair') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const matchId = interaction.values[0];

        try {
            const { repairSingleMatchThread } = await import('../logic/tournamentLogic.js');
            const result = await repairSingleMatchThread(client, guild, tournamentShortId, matchId);

            if (result.success) {
                let message = `✅ **Hilo Reparado con Éxito**\n\n`;
                message += `🆔 Match ID: \`${matchId}\`\n`;
                message += `🔗 Thread ID: \`${result.threadId}\`\n`;
                if (result.wasOrphan) {
                    message += `📝 Nota: El hilo anterior estaba perdido, se creó uno nuevo.`;
                }
                await interaction.editReply({ content: message, components: [] });
            } else {
                await interaction.editReply({
                    content: `❌ Error al reparar el hilo:\n${result.error}`,
                    components: []
                });
            }
        } catch (error) {
            console.error('[THREAD REPAIR]', error);
            await interaction.editReply({
                content: `❌ Error crítico: ${error.message}`,
                components: []
            });
        }
        return;
    }

    // =======================================================
    // --- LÓGICA ORIGINAL DEL BOT ---
    // =======================================================

    // --- MANUAL RESULT MANAGEMENT LOGIC ---
    if (action === 'admin_select_tournament_manual_results') {
        await interaction.deferUpdate();
        const tournamentShortId = interaction.values[0];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament) {
            return interaction.editReply({ content: 'Error: Torneo no encontrado.', components: [] });
        }

        const approvedTeams = Object.values(tournament.teams.aprobados);

        if (approvedTeams.length === 0) {
            return interaction.editReply({ content: '❌ No hay equipos aprobados en este torneo.', components: [] });
        }

        // Sort teams alphabetically
        approvedTeams.sort((a, b) => a.nombre.localeCompare(b.nombre));

        // Pagination logic if needed, but for now let's assume < 25 or just show first 25
        // If we have more than 25 teams, we might need pagination, but let's start simple as requested
        // or just slice 25.
        const teamsToShow = approvedTeams.slice(0, 25);

        const teamOptions = teamsToShow.map(t => ({
            label: t.nombre,
            description: `Manager: ${t.capitanTag}`,
            value: t.id // This is usually the managerId/captainId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_team_manual_results:${tournamentShortId}`)
            .setPlaceholder('Selecciona el EQUIPO para ver sus partidos')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: `Selecciona un **Equipo** del torneo **${tournament.nombre}** para ver su lista de partidos (jugados y pendientes):`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_select_team_manual_results') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const teamId = interaction.values[0];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament) {
            return interaction.editReply({ content: 'Error: Torneo no encontrado.', components: [] });
        }

        const team = tournament.teams.aprobados[teamId];
        if (!team) {
            return interaction.editReply({ content: 'Error: Equipo no encontrado.', components: [] });
        }

        let teamMatches = [];

        // 1. Collect matches from Group Stage
        if (tournament.structure.calendario) {
            for (const groupName in tournament.structure.calendario) {
                const groupMatches = tournament.structure.calendario[groupName];
                groupMatches.forEach(m => {
                    if (m.equipoA.id === teamId || m.equipoB.id === teamId) {
                        teamMatches.push({ ...m, context: `Grupo ${groupName}` });
                    }
                });
            }
        }

        // 2. Collect matches from Knockout Stage
        if (tournament.structure.eliminatorias) {
            for (const stageKey in tournament.structure.eliminatorias) {
                if (stageKey === 'rondaActual') continue;
                const stageData = tournament.structure.eliminatorias[stageKey];

                if (Array.isArray(stageData)) {
                    stageData.forEach(m => {
                        if (m && (m.equipoA.id === teamId || m.equipoB.id === teamId)) {
                            teamMatches.push({ ...m, context: stageKey.replace(/_/g, ' ').toUpperCase() });
                        }
                    });
                } else if (stageData && typeof stageData === 'object' && stageData.matchId) {
                    if (stageData.equipoA.id === teamId || stageData.equipoB.id === teamId) {
                        teamMatches.push({ ...stageData, context: stageKey.replace(/_/g, ' ').toUpperCase() });
                    }

                    await interaction.editReply({
                        content: `Partidos de **${team.nombre}** (Ordenados por Jornada):\nSelecciona uno para editar/poner su resultado.`,
                        components: [new ActionRowBuilder().addComponents(selectMenu)]
                    });
                    return;
                }
            }
        }

        if (teamMatches.length === 0) {
            return interaction.editReply({ content: `❌ El equipo **${team.nombre}** no tiene partidos asignados todavía.`, components: [] });
        }

        // --- SORTING LOGIC ---
        // Helper to extract number from "Jornada X" or "Ronda X"
        const getRoundNumber = (match) => {
            if (match.jornada) return parseInt(match.jornada);
            const contextMatch = match.context.match(/(\d+)/);
            return contextMatch ? parseInt(contextMatch[1]) : 999;
        };

        teamMatches.sort((a, b) => {
            // 1. Sort by Round/Jornada
            const roundA = getRoundNumber(a);
            const roundB = getRoundNumber(b);
            if (roundA !== roundB) return roundA - roundB;

            // 2. If same round, sort by matchId
            return a.matchId.localeCompare(b.matchId);
        });

        // Slice to 25 just in case
        const matchesToShow = teamMatches.slice(0, 25);

        const matchOptions = matchesToShow.map(m => {
            // Label: [Jornada X] Local vs Visitante
            // We try to use m.jornada if available, otherwise context
            const roundLabel = m.jornada ? `Jornada ${m.jornada}` : m.context;
            const label = `[${roundLabel}] ${m.equipoA.nombre} vs ${m.equipoB.nombre}`;

            // Description: Result or Pending
            const resultStatus = m.status === 'finalizado' ? `✅ ${m.resultado}` : '⏳ Pendiente';

            // Truncate label if too long (Discord limit is 100)
            const safeLabel = label.length > 100 ? label.substring(0, 97) + '...' : label;

            return {
                label: safeLabel,
                description: resultStatus,
                value: m.matchId
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_match_manual_results:${tournamentShortId}`)
            .setPlaceholder('Selecciona el partido para poner resultado')
            .addOptions(matchOptions);

        await interaction.editReply({
            content: `Partidos de **${team.nombre}** (Ordenados por Jornada):\nSelecciona uno para editar/poner su resultado.`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_select_match_manual_results') {
        const [tournamentShortId] = params;
        const matchId = interaction.values[0];

        // We show a modal directly
        const modal = new ModalBuilder()
            .setCustomId(`admin_manual_result_modal:${tournamentShortId}:${matchId}`)
            .setTitle('Introducir Resultado Manual');

        const homeGoalsInput = new TextInputBuilder()
            .setCustomId('home_goals')
            .setLabel("Goles LOCAL (Equipo A)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ej: 2")
            .setRequired(true);

        const awayGoalsInput = new TextInputBuilder()
            .setCustomId('away_goals')
            .setLabel("Goles VISITANTE (Equipo B)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ej: 1")
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(homeGoalsInput),
            new ActionRowBuilder().addComponents(awayGoalsInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_edit_team_select') {
        const [tournamentShortId] = params;
        const captainId = interaction.values[0]; // El ID del capitán del equipo seleccionado
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const team = tournament.teams.aprobados[captainId];

        if (!team) {
            return interaction.reply({ content: 'Error: No se pudo encontrar el equipo seleccionado.', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId(`admin_edit_team_modal:${tournamentShortId}:${captainId}`)
            .setTitle(`Editando: ${team.nombre}`);

        const teamNameInput = new TextInputBuilder().setCustomId('team_name_input').setLabel("Nombre del Equipo").setStyle(TextInputStyle.Short).setValue(team.nombre).setRequired(true);
        const eafcNameInput = new TextInputBuilder().setCustomId('eafc_name_input').setLabel("Nombre en EAFC").setStyle(TextInputStyle.Short).setValue(team.eafcTeamName).setRequired(true);
        const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Twitter (sin @)").setStyle(TextInputStyle.Short).setValue(team.twitter || '').setRequired(false);
        const streamInput = new TextInputBuilder().setCustomId('stream_url_input').setLabel("URL Completa del Stream").setStyle(TextInputStyle.Short).setValue(team.streamChannel || '').setRequired(false).setPlaceholder('Ej: https://www.twitch.tv/nombre');
        const logoUrlInput = new TextInputBuilder().setCustomId('logo_url_input').setLabel("URL del Logo (completa)").setStyle(TextInputStyle.Short).setValue(team.logoUrl || '').setRequired(false).setPlaceholder('Ej: https://i.imgur.com/logo.png');

        modal.addComponents(
            new ActionRowBuilder().addComponents(teamNameInput),
            new ActionRowBuilder().addComponents(eafcNameInput),
            new ActionRowBuilder().addComponents(twitterInput),
            new ActionRowBuilder().addComponents(streamInput),
            new ActionRowBuilder().addComponents(logoUrlInput)
        );

        await interaction.showModal(modal);
        return;
    }

    // --- MANUAL SWAP LOGIC ---
    if (action === 'admin_manual_swap_select_1') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const team1Id = interaction.values[0];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        // Find group of team 1
        let group1Name;
        for (const [gName, gData] of Object.entries(tournament.structure.grupos)) {
            if (gData.equipos.some(t => t.id === team1Id)) {
                group1Name = gName;
                break;
            }
        }

        // Show available teams in OTHER groups
        const teamOptions = [];
        for (const [gName, gData] of Object.entries(tournament.structure.grupos)) {
            if (gName === group1Name) continue;
            gData.equipos.forEach(t => {
                teamOptions.push({
                    label: t.nombre,
                    description: `Grupo: ${gName}`,
                    value: t.id,
                    emoji: '🔄'
                });
            });
        }

        if (teamOptions.length === 0) {
            return interaction.editReply({ content: 'No hay otros equipos disponibles para intercambiar.', components: [] });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_manual_swap_team_2:${tournamentShortId}:${team1Id}`) // Reuse the final step handler
            .setPlaceholder('Selecciona el equipo por el que cambiar')
            .addOptions(teamOptions.slice(0, 25)); // Safety slice

        await interaction.editReply({
            content: 'Selecciona el equipo por el que quieres realizar el cambio:',
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_manual_swap_group_1') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const groupName = interaction.values[0];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        const group = tournament.structure.grupos[groupName];
        const teamOptions = group.equipos.map(t => ({
            label: t.nombre,
            value: t.id,
            emoji: '🛡️'
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_manual_swap_team_1:${tournamentShortId}:${groupName}`)
            .setPlaceholder(`Selecciona equipo de ${groupName}`)
            .addOptions(teamOptions);

        await interaction.editReply({
            content: `Paso 2: Selecciona el equipo del **${groupName}** que quieres mover.`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_manual_swap_team_1') {
        await interaction.deferUpdate();
        const [tournamentShortId, group1Name] = params;
        const team1Id = interaction.values[0];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        // Filter out the group selected in step 1
        const otherGroups = Object.keys(tournament.structure.grupos).filter(g => g !== group1Name);

        if (otherGroups.length === 0) {
            return interaction.editReply({ content: 'Error: No hay otros grupos disponibles para intercambiar.', components: [] });
        }

        const groupOptions = otherGroups.map(g => ({ label: g, value: g }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_manual_swap_group_2:${tournamentShortId}:${team1Id}`)
            .setPlaceholder('Paso 3: Selecciona el GRUPO destino')
            .addOptions(groupOptions);

        await interaction.editReply({
            content: `Paso 3: Selecciona el grupo con el que quieres hacer el intercambio.`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_manual_swap_group_2') {
        await interaction.deferUpdate();
        const [tournamentShortId, team1Id] = params;
        const group2Name = interaction.values[0];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        const group = tournament.structure.grupos[group2Name];
        const teamOptions = group.equipos.map(t => ({
            label: t.nombre,
            value: t.id,
            emoji: '🔄'
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_manual_swap_team_2:${tournamentShortId}:${team1Id}`)
            .setPlaceholder(`Paso 4: Selecciona equipo de ${group2Name}`)
            .addOptions(teamOptions);

        await interaction.editReply({
            content: `Paso 4: Selecciona el equipo del **${group2Name}** por el que quieres cambiar.`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_manual_swap_team_2') {
        await interaction.deferUpdate();
        const [tournamentShortId, team1Id] = params;
        const team2Id = interaction.values[0];

        try {
            // Import dynamically
            const { swapTeamsDataOnly } = await import('../logic/tournamentLogic.js');
            const result = await swapTeamsDataOnly(client, tournamentShortId, team1Id, team2Id);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_manual_swap_start:${tournamentShortId}`)
                    .setLabel('🔄 Seguir Cambiando')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`admin_manual_regenerate:${tournamentShortId}`)
                    .setLabel('💾 Guardar y Regenerar Calendario')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.editReply({
                content: `✅ **Intercambio Realizado (Solo Datos)**\n${result.message}\n\n⚠️ **IMPORTANTE:** El calendario NO se ha actualizado todavía. Puedes seguir haciendo cambios. Cuando termines, pulsa "Guardar y Regenerar Calendario".`,
                components: [row]
            });
        } catch (error) {
            console.error(error);
            await interaction.editReply({
                content: `❌ Error al intercambiar equipos: ${error.message}`,
                components: []
            });
        }
        return;
    }

    // --- INICIO DE LA LÓGICA AÑADIDA ---
    if (action === 'draft_pick_search_type') {
        await interaction.deferUpdate();
        const [draftShortId, captainId] = params;
        const searchType = interaction.values[0]; // 'primary' o 'secondary'

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const availablePlayers = draft.players.filter(p => !p.isCaptain && !p.captainId);

        const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({
            label: value,
            value: key,
        }));

        const positionMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_pick_by_position:${draftShortId}:${captainId}:${searchType}`) // Se podría usar el searchType aquí si la lógica cambiara
            .setPlaceholder(`Elige la POSICIÓN ${searchType === 'primary' ? 'PRIMARIA' : 'SECUNDARIA'} que buscas`)
            .addOptions(positionOptions);

        await interaction.editReply({
            content: `Búsqueda cambiada. Por favor, elige la posición que quieres cubrir.`,
            components: [new ActionRowBuilder().addComponents(positionMenu)]
        });
        return;
    }
    // --- FIN DE LA LÓGICA AÑADIDA ---

    if (action === 'admin_select_draft_to_manage_players') {
        await interaction.deferUpdate();
        const draftShortId = interaction.values[0];

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        if (!draft.captains || draft.captains.length === 0) {
            return interaction.editReply({
                content: `❌ El draft **${draft.name}** no tiene capitanes aprobados. No hay plantillas para gestionar.`,
                components: []
            });
        }

        const teamOptions = draft.captains.map(c => ({
            label: c.teamName,
            description: `Capitán: ${c.userName}`,
            value: c.userId
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_team_to_manage:${draftShortId}`)
            .setPlaceholder('Selecciona un equipo para ver su plantilla')
            .addOptions(teamOptions);

        await interaction.editReply({
            content: `Gestionando **${draft.name}**. Selecciona un equipo:`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'admin_select_team_to_manage') {
        await interaction.deferUpdate();
        const [draftShortId] = params;
        const teamId = interaction.values[0];

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const team = draft.captains.find(c => c.userId === teamId);
        const teamPlayers = draft.players.filter(p => p.captainId === teamId);

        const rosterEmbed = createTeamRosterManagementEmbed(team, teamPlayers, draftShortId);
        await interaction.editReply(rosterEmbed);
        return;
    }

    if (action === 'admin_select_player_from_roster') {
        await interaction.deferUpdate();
        const [draftShortId, teamId] = params;
        const selectedPlayerId = interaction.values[0];

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const player = draft.players.find(p => p.userId === selectedPlayerId);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        // Llamamos a la ficha en modo 'manage' para que muestre los botones de acción
        const playerManagementEmbed = await createPlayerManagementEmbed(interaction.client, player, draft, teamId, isAdmin, 'manage');
        await interaction.editReply(playerManagementEmbed);
        return;
    }

    if (action === 'admin_select_captain_to_edit') {
        const [draftShortId] = params;
        const captainId = interaction.values[0];
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const captain = draft.captains.find(c => c.userId === captainId);

        if (!captain) {
            return interaction.reply({ content: 'Error: No se pudo encontrar a ese capitán.', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId(`admin_edit_draft_captain_modal:${draftShortId}:${captainId}`)
            .setTitle(`Editando: ${captain.teamName}`);

        const teamNameInput = new TextInputBuilder().setCustomId('team_name_input').setLabel("Nombre del Equipo").setStyle(TextInputStyle.Short).setValue(captain.teamName).setRequired(true);
        const psnIdInput = new TextInputBuilder().setCustomId('psn_id_input').setLabel("PSN ID / EA ID").setStyle(TextInputStyle.Short).setValue(captain.psnId).setRequired(true);
        const streamUrlInput = new TextInputBuilder().setCustomId('stream_url_input').setLabel("URL Completa del Stream").setStyle(TextInputStyle.Short).setValue(captain.streamChannel || '').setRequired(false).setPlaceholder('Ej: https://twitch.tv/usuario');

        modal.addComponents(
            new ActionRowBuilder().addComponents(teamNameInput),
            new ActionRowBuilder().addComponents(psnIdInput),
            new ActionRowBuilder().addComponents(streamUrlInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (action === 'captain_invite_replacement_select') {
        await interaction.deferUpdate();
        const [draftShortId, teamId, kickedPlayerId] = params;
        const replacementPlayerId = interaction.values[0];

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        try {
            await inviteReplacementPlayer(client, draft, teamId, kickedPlayerId, replacementPlayerId);
            await interaction.editReply({ content: '✅ Invitación enviada al jugador de reemplazo.', components: [] });
        } catch (error) {
            await interaction.editReply({ content: `❌ Error: ${error.message}`, components: [] });
        }
        return;
    }

    if (action === 'draft_create_tournament_format') {
        const [draftShortId] = params;
        const selectedFormatId = interaction.values[0];

        // --- INICIO DE LA LÓGICA UNIFICADA Y CORREGIDA ---

        if (selectedFormatId === 'flexible_league') {
            await interaction.deferUpdate();
            const typeMenu = new StringSelectMenuBuilder()
                .setCustomId(`draft_league_type_select:${draftShortId}`)
                .setPlaceholder('Selecciona el tipo de Liguilla')
                .addOptions([
                    { label: 'Todos contra Todos (Round Robin)', value: 'all_vs_all', emoji: '⚔️' },
                    { label: 'Liguilla Custom (Jornadas fijas)', value: 'round_robin_custom', emoji: '📅' },
                    { label: 'Sistema Suizo', value: 'swiss', emoji: '🇨🇭' }
                ]);

            await interaction.editReply({
                content: 'Has elegido "Liguilla". Por favor, selecciona la modalidad de la misma:',
                components: [new ActionRowBuilder().addComponents(typeMenu)]
            });
            return;

        } else {
            // CAMINO B: Si es un torneo normal (8 o 16), lo creamos y luego enviamos los botones de sorteo.
            await interaction.deferUpdate();
            try {
                const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
                const captainCount = draft.captains.length;

                const newTournament = await createTournamentFromDraft(client, guild, draftShortId, selectedFormatId, {});

                await interaction.editReply({
                    content: `✅ ¡Torneo **"${newTournament.nombre}"** creado con éxito a partir del draft!`,
                    components: []
                });

                const managementThread = await client.channels.fetch(newTournament.discordMessageIds.managementThreadId);
                const actionRow = new ActionRowBuilder();

                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`admin_force_draw:${newTournament.shortId}`)
                        .setLabel('Iniciar Sorteo Clásico')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎲')
                );

                if (captainCount === 8 || captainCount === 16) {
                    actionRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`draft_force_tournament_roulette:${draft.shortId}`)
                            .setLabel('Iniciar Sorteo con Ruleta')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🎡')
                    );
                }

                await managementThread.send({
                    content: 'El torneo ha sido poblado con los equipos del draft. Por favor, elige el método de sorteo:',
                    components: [actionRow]
                });

            } catch (error) {
                console.error(error);
                await interaction.editReply({
                    content: `❌ Hubo un error crítico al crear el torneo desde el draft: ${error.message}`,
                    components: []
                });
            }
        }
        // --- FIN DE LA LÓGICA UNIFICADA ---
        return;
    }

    if (action === 'draft_league_type_select') {
        const [draftShortId] = params;
        const leagueType = interaction.values[0];

        if (leagueType === 'all_vs_all') {
            const modal = new ModalBuilder()
                .setCustomId(`draft_league_all_vs_all_modal:${draftShortId}`)
                .setTitle('Liguilla: Todos contra Todos');

            const matchesInput = new TextInputBuilder()
                .setCustomId('matches_input')
                .setLabel('Nº Encuentros (1=Ida, 2=Ida/Vuelta)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const qualifiersInput = new TextInputBuilder()
                .setCustomId('torneo_qualifiers')
                .setLabel('Equipos a Play-Offs (0=Líder Gana)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: 0, 4, 8...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(matchesInput), new ActionRowBuilder().addComponents(qualifiersInput));
            return interaction.showModal(modal);

        } else if (leagueType === 'round_robin_custom') {
            const modal = new ModalBuilder()
                .setCustomId(`draft_league_custom_modal:${draftShortId}`)
                .setTitle('Liguilla: Jornadas Custom');

            const roundsInput = new TextInputBuilder()
                .setCustomId('rounds_input')
                .setLabel('Número de Jornadas a jugar')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const qualifiersInput = new TextInputBuilder()
                .setCustomId('torneo_qualifiers')
                .setLabel('Equipos a Play-Offs (0=Líder Gana)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: 0, 4, 8...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(roundsInput), new ActionRowBuilder().addComponents(qualifiersInput));
            return interaction.showModal(modal);

        } else if (leagueType === 'swiss') {
            const modal = new ModalBuilder()
                .setCustomId(`draft_league_swiss_modal:${draftShortId}`)
                .setTitle('Liguilla: Sistema Suizo');

            const roundsInput = new TextInputBuilder()
                .setCustomId('rounds_input')
                .setLabel('Número de Rondas (Jornadas)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const qualifiersInput = new TextInputBuilder()
                .setCustomId('torneo_qualifiers')
                .setLabel('Equipos a Play-Offs (0=Líder Gana)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: 0, 4, 8...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(roundsInput), new ActionRowBuilder().addComponents(qualifiersInput));
            return interaction.showModal(modal);
        }
        return;
    }

    if (action === 'create_draft_type') {
        const [name] = params;
        const type = interaction.values[0];

        if (type === 'gratis') {
            await interaction.deferUpdate();
            const isPaid = false;
            const shortId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const config = { isPaid, entryFee: 0, prizeCampeon: 0, prizeFinalista: 0 };

            try {
                await createNewDraft(client, guild, name, shortId, config);
                await interaction.editReply({ content: `✅ ¡Éxito! El draft gratuito **"${name}"** ha sido creado.`, components: [] });
            } catch (error) {
                console.error("Error capturado por el handler al crear el draft:", error);
                await interaction.editReply({ content: `❌ Ocurrió un error: ${error.message}`, components: [] });
            }
        } else { // type === 'pago'
            const modal = new ModalBuilder()
                .setCustomId(`create_draft_paid_modal:${name}`)
                .setTitle(`Crear Draft de Pago: ${name}`);

            const entryFeeInput = new TextInputBuilder()
                .setCustomId('draft_entry_fee')
                .setLabel("Cuota de Inscripción por Jugador (€)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Ej: 5');

            const prizeCInput = new TextInputBuilder()
                .setCustomId('draft_prize_campeon')
                .setLabel("Premio Equipo Campeón (€)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Ej: 300');

            const prizeFInput = new TextInputBuilder()
                .setCustomId('draft_prize_finalista')
                .setLabel("Premio Equipo Subcampeón (€)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue('0');

            modal.addComponents(
                new ActionRowBuilder().addComponents(entryFeeInput),
                new ActionRowBuilder().addComponents(prizeCInput),
                new ActionRowBuilder().addComponents(prizeFInput)
            );
            await interaction.showModal(modal);
        }
        return;
    }

    if (action === 'admin_kick_participant_draft_select') {
        await interaction.deferUpdate();
        const [draftShortId] = params;
        const userIdToKick = interaction.values[0];
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        await kickPlayerFromDraft(client, draft, userIdToKick);

        await interaction.editReply({ content: `✅ El participante ha sido expulsado del draft.`, components: [] });
        return;
    }

    if (action === 'admin_kick_participant_page_select') {
        await interaction.deferUpdate();
        const [draftShortId] = params;
        const page = parseInt(interaction.values[0].replace('page_', ''));
        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const allParticipants = [...draft.captains, ...draft.players.filter(p => !p.isCaptain)];

        const pageSize = 25;
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        const participantsPage = allParticipants.slice(startIndex, endIndex);

        const options = participantsPage.map(p => {
            const isCaptain = draft.captains.some(c => c.userId === p.userId);
            return {
                label: p.userName || p.psnId,
                description: isCaptain ? `CAPITÁN - ${p.psnId}` : `JUGADOR - ${p.psnId}`,
                value: p.userId,
                emoji: isCaptain ? '👑' : '👤'
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_kick_participant_draft_select:${draftShortId}`)
            .setPlaceholder(`Selecciona de la Página ${page + 1}`)
            .addOptions(options);

        const pageCount = Math.ceil(allParticipants.length / pageSize);
        const pageOptions = [];
        for (let i = 0; i < pageCount; i++) {
            const start = i * pageSize + 1;
            const end = Math.min((i + 1) * pageSize, allParticipants.length);
            pageOptions.push({
                label: `Página ${i + 1} (${start}-${end})`,
                value: `page_${i}`,
            });
        }
        const pageMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_kick_participant_page_select:${draftShortId}`)
            .setPlaceholder('Selecciona otra página')
            .addOptions(pageOptions);

        await interaction.editReply({
            content: 'Selecciona un participante de la lista para expulsarlo del draft. Esta acción es irreversible.',
            components: [new ActionRowBuilder().addComponents(pageMenu), new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    if (action === 'draft_register_captain_pos_select') {
        const [draftShortId, channelId] = params;
        const position = interaction.values[0];

        const platformButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`select_stream_platform:twitch:register_draft_captain:${draftShortId}:${position}:${channelId}`).setLabel('Twitch').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`select_stream_platform:youtube:register_draft_captain:${draftShortId}:${position}:${channelId}`).setLabel('YouTube').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({
            content: `Has seleccionado **${DRAFT_POSITIONS[position]}**. Ahora, selecciona tu plataforma de transmisión.`,
            components: [platformButtons]
        });
        return;
    }

    if (action === 'draft_register_player_pos_select_primary') {
        const [draftShortId, channelId] = params;
        const primaryPosition = interaction.values[0];

        const positionOptions = Object.entries(DRAFT_POSITIONS)
            .filter(([key]) => key !== primaryPosition)
            .map(([key, value]) => ({
                label: value,
                value: key
            }));

        positionOptions.unshift({
            label: 'No tengo posición secundaria',
            value: 'NONE',
            emoji: '✖️'
        });

        const secondaryPosMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_register_player_pos_select_secondary:${draftShortId}:${primaryPosition}:${channelId}`)
            .setPlaceholder('Paso 2: Selecciona tu posición SECUNDARIA')
            .addOptions(positionOptions);

        await interaction.update({
            content: `Has elegido **${DRAFT_POSITIONS[primaryPosition]}** como primaria. Ahora, selecciona tu posición secundaria.`,
            components: [new ActionRowBuilder().addComponents(secondaryPosMenu)]
        });
        return;
    }

    if (action === 'draft_register_player_pos_select_secondary') {
        const [draftShortId, primaryPosition, channelId] = params;
        const secondaryPosition = interaction.values[0];
        const teamStatus = 'Libre'; // Siempre agente libre — ya no se pregunta
        const verifiedData = await checkVerification(interaction.user.id);

        // Si el usuario está verificado pero no tiene WhatsApp, se lo pedimos.
        if (verifiedData && !verifiedData.whatsapp) {
            const whatsappModal = new ModalBuilder()
                .setCustomId(`add_whatsapp_to_profile_modal:player:${draftShortId}:${primaryPosition}:${secondaryPosition}:${teamStatus}:${channelId}`)
                .setTitle('Dato Requerido: WhatsApp');

            const whatsappInput = new TextInputBuilder().setCustomId('whatsapp_input').setLabel("Tu WhatsApp (Ej: +34 123456789)").setStyle(TextInputStyle.Short).setRequired(true);
            const whatsappConfirmInput = new TextInputBuilder().setCustomId('whatsapp_confirm_input').setLabel("Confirma tu WhatsApp").setStyle(TextInputStyle.Short).setRequired(true);

            whatsappModal.addComponents(new ActionRowBuilder().addComponents(whatsappInput), new ActionRowBuilder().addComponents(whatsappConfirmInput));
            return interaction.showModal(whatsappModal);
        }

        // Flujo directo: usuario verificado → inscripción sin más preguntas
        if (verifiedData) {
            await interaction.deferUpdate();
            const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
            const playerData = {
                userId: interaction.user.id, userName: interaction.user.tag,
                psnId: verifiedData.gameId, twitter: verifiedData.twitter, whatsapp: verifiedData.whatsapp,
                primaryPosition, secondaryPosition, currentTeam: 'Libre',
                isCaptain: false, captainId: null
            };
            await db.collection('drafts').updateOne({ _id: draft._id }, { $push: { players: playerData } });
            await interaction.editReply({ content: `✅ ¡Inscripción completada! Hemos usado tus datos verificados.`, components: [] });

            if (channelId && channelId !== 'no-ticket') {
                const ticketChannel = await client.channels.fetch(channelId).catch(() => null);
                if (ticketChannel) {
                    await ticketChannel.send('✅ Proceso de inscripción finalizado. Este canal se cerrará en 10 segundos.');
                    setTimeout(() => ticketChannel.delete('Inscripción completada.').catch(console.error), 10000);
                }
            }

            const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
            updatePublicMessages(client, updatedDraft);
            updateDraftMainInterface(client, updatedDraft.shortId);
            notifyVisualizer(updatedDraft);
            return;
        }

        // Flujo para no verificados: pedimos PSN ID y Twitter
        const modal = new ModalBuilder()
            .setCustomId(`register_draft_player_modal:${draftShortId}:${primaryPosition}:${secondaryPosition}:${teamStatus}:${channelId}`)
            .setTitle('Finalizar Inscripción de Jugador');
        const psnIdInput = new TextInputBuilder().setCustomId('psn_id_input').setLabel("Tu PSN ID / EA ID").setStyle(TextInputStyle.Short).setRequired(true);
        const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu Twitter (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(psnIdInput), new ActionRowBuilder().addComponents(twitterInput));
        await interaction.showModal(modal);
        return;
    }

    // --- NUEVOS FLUJOS DE SELECCIÓN DE USUARIO MANUAL ---
    if (action === 'admin_select_manual_cap_pos') {
        const [draftShortId] = params;
        const selectedPosition = interaction.values[0];

        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`admin_add_cap_user_sel:${draftShortId}:${selectedPosition}`)
            .setPlaceholder('Selecciona el Usuario de Discord');

        await interaction.reply({
            content: `Has seleccionado la posición: **${selectedPosition}**.\n\nAhora, selecciona el usuario de Discord (empieza a escribir su nombre) para asignarle el Equipo:`,
            components: [new ActionRowBuilder().addComponents(userSelect)],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    if (action === 'admin_add_cap_user_sel') {
        const [draftShortId, position] = params;
        const selectedUserId = interaction.values[0]; // Discord ID seleccionado

        const verifiedUser = await db.collection('verified_users').findOne({ discordId: selectedUserId });

        const modal = new ModalBuilder()
            .setCustomId(`admin_add_captain_manual_submit:${draftShortId}:${selectedUserId}`)
            .setTitle('Completar Datos del Capitán');

        const psnIdInput = new TextInputBuilder()
            .setCustomId('captain_psn_id')
            .setLabel("PSN ID / EA Name")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const actualPsnIdCap = verifiedUser ? (verifiedUser.psnId || verifiedUser.gameId) : null;
        if (actualPsnIdCap) {
            psnIdInput.setValue(actualPsnIdCap);
        }

        const teamNameInput = new TextInputBuilder()
            .setCustomId('captain_team_name')
            .setLabel("Nombre de su Equipo (Tag/Abrev)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const positionInput = new TextInputBuilder()
            .setCustomId('captain_primary_pos')
            .setLabel("Posición Princ. (GK, DFC, CARR, MC, DC)")
            .setStyle(TextInputStyle.Short)
            .setValue(position)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(psnIdInput),
            new ActionRowBuilder().addComponents(teamNameInput),
            new ActionRowBuilder().addComponents(positionInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_add_plr_user_sel') {
        const [draftShortId, position] = params;
        const selectedUserId = interaction.values[0];

        const verifiedUser = await db.collection('verified_users').findOne({ discordId: selectedUserId });

        const modal = new ModalBuilder()
            .setCustomId(`admin_add_player_manual_modal:${draftShortId}:${position}:${selectedUserId}`)
            .setTitle('Completar Datos del Jugador');

        const psnIdInput = new TextInputBuilder()
            .setCustomId('psn_id_input')
            .setLabel("Nombre en el juego (PSN ID / EA ID)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const actualPsnIdPlr = verifiedUser ? (verifiedUser.psnId || verifiedUser.gameId) : null;
        if (actualPsnIdPlr) {
            psnIdInput.setValue(actualPsnIdPlr);
        }

        const twitterInput = new TextInputBuilder()
            .setCustomId('twitter_input')
            .setLabel("Twitter (sin @)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Opcional")
            .setRequired(false); // OPTIONAL POR PETICIÓN DEL USUARIO

        if (verifiedUser && verifiedUser.twitter) {
            twitterInput.setValue(verifiedUser.twitter);
        }

        const whatsappInput = new TextInputBuilder()
            .setCustomId('whatsapp_input')
            .setLabel("WhatsApp (con prefijo, ej: +34)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Si se solicitó para el torneo")
            .setRequired(false);

        if (verifiedUser && verifiedUser.whatsapp) {
            whatsappInput.setValue(verifiedUser.whatsapp);
        }

        modal.addComponents(
            new ActionRowBuilder().addComponents(psnIdInput),
            new ActionRowBuilder().addComponents(twitterInput),
            new ActionRowBuilder().addComponents(whatsappInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_add_partic_user_sel') {
        const [draftShortId] = params;
        const selectedUserId = interaction.values[0];

        const verifiedUser = await db.collection('verified_users').findOne({ discordId: selectedUserId });

        const modal = new ModalBuilder()
            .setCustomId(`admin_add_participant_manual_modal:${draftShortId}:${selectedUserId}`)
            .setTitle('Añadir Jugador Manualmente');

        const gameIdInput = new TextInputBuilder()
            .setCustomId('manual_game_id')
            .setLabel("ID de Juego (PSN/Gamertag)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const actualPsnIdPartic = verifiedUser ? (verifiedUser.psnId || verifiedUser.gameId) : null;
        if (actualPsnIdPartic) {
            gameIdInput.setValue(actualPsnIdPartic);
        }

        const whatsappInput = new TextInputBuilder()
            .setCustomId('manual_whatsapp')
            .setLabel("WhatsApp (con prefijo si es posible)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("+34600123456")
            .setRequired(true);

        if (verifiedUser && verifiedUser.whatsapp) {
            whatsappInput.setValue(verifiedUser.whatsapp);
        }

        const positionInput = new TextInputBuilder()
            .setCustomId('manual_position')
            .setLabel("Posición (GK, DFC, CARR, MC, DC)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("DC")
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gameIdInput),
            new ActionRowBuilder().addComponents(whatsappInput),
            new ActionRowBuilder().addComponents(positionInput)
        );

        await interaction.showModal(modal);
        return;
    }
    // --- FIN DE LOS FLUJOS ---

    if (action === 'admin_select_manual_player_pos') {
        const [draftShortId] = params;
        const selectedPosition = interaction.values[0];

        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`admin_add_plr_user_sel:${draftShortId}:${selectedPosition}`)
            .setPlaceholder('Selecciona el Usuario de Discord');

        const ghostButtonBtn = new ButtonBuilder()
            .setCustomId(`admin_add_ghost_plr_start:${draftShortId}:${selectedPosition}`)
            .setLabel('Añadir Fantasma (Sin Discord)')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👻');

        await interaction.reply({
            content: `Has seleccionado Posición Primaria: **${selectedPosition}**.\n\nAhora, selecciona el usuario de Discord (empieza a escribir su nombre). Si no tiene cuenta verificada, usa la opción de Fantasma.`,
            components: [
                new ActionRowBuilder().addComponents(userSelect),
                new ActionRowBuilder().addComponents(ghostButtonBtn)
            ],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }


    if (action === 'draft_pick_by_position') {
        await interaction.deferUpdate();
        // params: draftShortId, captainId, searchType ('primary'|'secondary'|undefined), page (default 0)
        const [draftShortId, captainId, searchType, pageStr] = params;
        const selectedPosition = interaction.values[0];
        const page = parseInt(pageStr) || 0;
        const PAGE_SIZE = 25;

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const availablePlayers = draft.players.filter(p => !p.isCaptain && !p.captainId);

        let playersToShow;
        let searchMode;

        if (searchType === 'secondary') {
            playersToShow = availablePlayers.filter(p => p.secondaryPosition === selectedPosition);
            searchMode = 'Secundaria';
            if (playersToShow.length === 0) {
                return interaction.editReply({
                    content: `No hay jugadores con **${DRAFT_POSITIONS[selectedPosition]}** como posición secundaria. Prueba con otra posición.`,
                    components: []
                });
            }
        } else {
            playersToShow = availablePlayers.filter(p => p.primaryPosition === selectedPosition);
            searchMode = 'Primaria';
            if (playersToShow.length === 0) {
                playersToShow = availablePlayers.filter(p => p.secondaryPosition === selectedPosition);
                searchMode = 'Secundaria (fallback)';
            }
        }

        if (playersToShow.length === 0) {
            return interaction.editReply({
                content: `No hay jugadores disponibles para **${DRAFT_POSITIONS[selectedPosition]}**. Elige otra posición.`,
                components: []
            });
        }

        playersToShow.sort((a, b) => a.psnId.localeCompare(b.psnId));

        const totalPages = Math.ceil(playersToShow.length / PAGE_SIZE);
        const safePage = Math.max(0, Math.min(page, totalPages - 1));
        const pagePlayers = playersToShow.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

        const playerMenu = new StringSelectMenuBuilder()
            .setCustomId(`draft_pick_player:${draftShortId}:${captainId}:${selectedPosition}`)
            .setPlaceholder(`Página ${safePage + 1}/${totalPages} — Elige al jugador`)
            .addOptions(pagePlayers.map(player => ({
                label: player.psnId,
                description: player.psnId,
                value: player.userId,
            })));

        const components = [new ActionRowBuilder().addComponents(playerMenu)];

        // Botones de paginación solo si hay más de una página
        if (totalPages > 1) {
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`draft_pick_page:${draftShortId}:${captainId}:${selectedPosition}:${searchType || 'primary'}:${safePage - 1}`)
                    .setLabel('← Anterior')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage === 0),
                new ButtonBuilder()
                    .setCustomId(`draft_pick_page_info`)
                    .setLabel(`Página ${safePage + 1} de ${totalPages} (${playersToShow.length} jugadores)`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`draft_pick_page:${draftShortId}:${captainId}:${selectedPosition}:${searchType || 'primary'}:${safePage + 1}`)
                    .setLabel('Siguiente →')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage >= totalPages - 1)
            );
            components.push(navRow);
        }

        await interaction.editReply({
            content: `Jugadores para **${DRAFT_POSITIONS[selectedPosition]}** (pos. **${searchMode}**):`,
            components
        });
        return;
    }

    if (action === 'draft_pick_player') {
        await interaction.deferUpdate();
        const [draftShortId, captainId, pickedForPosition] = params;
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });

        // Validar que el captainId del customId coincide con el turno activo real en DB
        const currentTurnCaptainId = draft.selection.order[draft.selection.turn];
        if (captainId !== currentTurnCaptainId && !isAdmin) {
            return interaction.followUp({ content: '⏳ El turno ya cambió. Esta selección no es válida.', flags: [MessageFlags.Ephemeral] });
        }
        // Validar que quien interactúa es el capitán del turno (o un admin)
        if (interaction.user.id !== captainId && !isAdmin) {
            return interaction.followUp({ content: '❌ No es tu turno de elegir.', flags: [MessageFlags.Ephemeral] });
        }
        const selectedPlayerId = interaction.values[0];

        const player = draft.players.find(p => p.userId === selectedPlayerId);

        const confirmationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`draft_confirm_pick:${draftShortId}:${captainId}:${selectedPlayerId}:${pickedForPosition}`)
                .setLabel('Confirmar y Finalizar Turno')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`draft_undo_pick:${draftShortId}:${captainId}`)
                .setLabel('Elegir Otro Jugador')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('↩️')
        );

        await interaction.editReply({
            content: `Has seleccionado a **${player.psnId}** (${player.userName}). ¿Confirmas tu elección?`,
            components: [confirmationRow]
        });
        return;
    }

    if (action === 'admin_set_channel_icon') {
        const [channelId] = params;
        const selectedIcon = interaction.values[0];

        // 1. Respondemos INMEDIATAMENTE para evitar el timeout.
        await interaction.update({
            content: `✅ ¡Orden recibida! El icono del canal se actualizará a ${selectedIcon} en unos segundos.`,
            components: []
        });

        // 2. AHORA, hacemos el trabajo sin prisa.
        await setChannelIcon(client, channelId, selectedIcon);

        return;
    }

    if (action === 'admin_assign_cocap_team_select') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const selectedCaptainId = interaction.values[0];

        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId(`admin_assign_cocap_user_select:${tournamentShortId}:${selectedCaptainId}`)
            .setPlaceholder('Paso 2: Busca y selecciona al nuevo co-capitán...')
            .setMinValues(1)
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(userSelectMenu);

        await interaction.editReply({
            content: 'Ahora, selecciona al miembro del servidor que quieres asignar como co-capitán de este equipo.',
            components: [row],
        });
        return;
    }

    if (action === 'admin_assign_cocap_user_select') {
        await interaction.deferUpdate();
        const [tournamentShortId, captainId] = params;
        const coCaptainId = interaction.values[0];

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.', components: [] });

        const team = tournament.teams.aprobados[captainId];
        if (!team) return interaction.editReply({ content: 'Error: El equipo seleccionado ya no existe.', components: [] });
        if (team.coCaptainId) return interaction.editReply({ content: 'Error: Este equipo ya tiene un co-capitán.', components: [] });

        let coCaptainUser;
        if (/^\d+$/.test(coCaptainId)) {
            coCaptainUser = await client.users.fetch(coCaptainId);
        } else {
            // Es un usuario de prueba/simulado
            coCaptainUser = {
                id: coCaptainId,
                tag: `TestUser_${coCaptainId}`,
                bot: false,
                send: async () => { } // Mock send
            };
        }

        if (coCaptainUser.bot) {
            return interaction.editReply({ content: 'No puedes asignar a un bot como co-capitán.', components: [] });
        }

        const allCaptainsAndCoCaptains = Object.values(tournament.teams.aprobados).flatMap(t => [t.capitanId, t.coCaptainId]).filter(Boolean);
        if (allCaptainsAndCoCaptains.includes(coCaptainId)) {
            return interaction.editReply({ content: '❌ Esta persona ya participa en el torneo como capitán o co-capitán.', components: [] });
        }

        try {
            await addCoCaptain(client, tournament, captainId, coCaptainId);

            const captainUser = await client.users.fetch(captainId).catch(() => null);
            if (captainUser) {
                await captainUser.send(`ℹ️ Un administrador te ha asignado a **${coCaptainUser.tag}** como co-capitán de tu equipo **${team.nombre}**.`);
            }

            if (coCaptainUser.send) { // Check if it's a real user or our mock with send method
                await coCaptainUser.send(`ℹ️ Un administrador te ha asignado como co-capitán del equipo **${team.nombre}** (Capitán: ${captainUser ? captainUser.tag : 'Desconocido'}) en el torneo **${tournament.nombre}**.`);
            }

            await interaction.editReply({ content: `✅ **${coCaptainUser.tag}** ha sido asignado como co-capitán del equipo **${team.nombre}**.`, components: [] });
        } catch (error) {
            console.error('Error al asignar co-capitán por admin:', error);
            await interaction.editReply({ content: 'Hubo un error al procesar la asignación.', components: [] });
        }
        return;
    }

    if (action === 'admin_create_format') {
        const formatId = interaction.values[0];
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_create_type:${formatId}`)
            .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
            .addOptions([{ label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' }]);

        await interaction.update({ content: `Formato seleccionado: **${TOURNAMENT_FORMATS[formatId].label}**. Ahora, el tipo:`, components: [new ActionRowBuilder().addComponents(typeMenu)] });

    } else if (action === 'admin_create_type') {
        const [formatId] = params;
        const type = interaction.values[0];

        // --- NUEVA LÓGICA PARA LIGA FLEXIBLE ---
        if (formatId === 'flexible_league') {
            const modal = new ModalBuilder()
                .setCustomId(`create_tournament:${formatId}:${type}:flexible`)
                .setTitle('Crear Liguilla Flexible');

            const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);

            const qualifiersInput = new TextInputBuilder()
                .setCustomId('torneo_qualifiers')
                .setLabel("Nº de Equipos que se Clasifican")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Ej: 4 (semis), 8 (cuartos)...")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(nombreInput));
            modal.addComponents(new ActionRowBuilder().addComponents(qualifiersInput));

            if (type === 'pago') {
                // Para torneos de pago, sacrificamos el campo de fecha de inicio para que quepan los 5 campos
                const entryFeeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Inscripción por Equipo (€)").setStyle(TextInputStyle.Short).setRequired(true);

                const prizesInput = new TextInputBuilder()
                    .setCustomId('torneo_prizes')
                    .setLabel("Premios: Campeón / Finalista (€)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ej: 100/50');

                const paymentMethodsInput = new TextInputBuilder()
                    .setCustomId('torneo_payment_methods')
                    .setLabel("Métodos Pago: PayPal / Bizum")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder('Ej: mi@email.com / 600111222');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(entryFeeInput),
                    new ActionRowBuilder().addComponents(prizesInput),
                    new ActionRowBuilder().addComponents(paymentMethodsInput)
                );
            } else {
                // Si es gratis, sí nos cabe la fecha de inicio
                const startTimeInput = new TextInputBuilder().setCustomId('torneo_start_time').setLabel("Fecha/Hora de Inicio (ej: Sáb 20, 22:00 CET)").setStyle(TextInputStyle.Short).setRequired(false);
                modal.addComponents(new ActionRowBuilder().addComponents(startTimeInput));
            }

            await interaction.showModal(modal);
            return;
        }
        // --- FIN NUEVA LÓGICA ---

        // CAMINO NORMAL: Si no es liga flexible, mostramos el selector de "Solo Ida" / "Ida y Vuelta"
        const matchTypeMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_create_match_type:${formatId}:${type}`)
            .setPlaceholder('Paso 3: Selecciona el tipo de partidos')
            .addOptions([
                {
                    label: 'Solo Ida (3 Jornadas)',
                    description: 'Los equipos de cada grupo se enfrentan una vez.',
                    value: 'ida'
                },
                {
                    label: 'Ida y Vuelta (6 Jornadas)',
                    description: 'Los equipos de cada grupo se enfrentan dos veces.',
                    value: 'idavuelta'
                }
            ]);

        await interaction.update({
            content: `Tipo seleccionado: **${type === 'pago' ? 'De Pago' : 'Gratuito'}**. Ahora, define las rondas:`,
            components: [new ActionRowBuilder().addComponents(matchTypeMenu)]
        });

    } else if (action === 'admin_change_format_select') {
        const [tournamentShortId] = params;
        const newFormatId = interaction.values[0];

        // --- FIX: Si cambiamos a Liguilla Flexible, pedimos los clasificados mediante un modal ---
        if (newFormatId === 'flexible_league') {
            const modal = new ModalBuilder()
                .setCustomId(`edit_tournament_to_flexible:${tournamentShortId}`)
                .setTitle('Configurar Liguilla Flexible');

            const qualifiersInput = new TextInputBuilder()
                .setCustomId('torneo_qualifiers')
                .setLabel("Nº de Equipos que se Clasifican")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Ej: 4 (semis), 8 (cuartos)...")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(qualifiersInput));
            await interaction.showModal(modal);
            return;
        }

        // Si es cualquier otro formato, actualizamos directamente y de forma silente
        await interaction.deferUpdate();
        await updateTournamentConfig(interaction.client, tournamentShortId, { formatId: newFormatId });
        await interaction.editReply({ content: `✅ Formato actualizado a: **${TOURNAMENT_FORMATS[newFormatId].label}**.`, components: [] });

    } else if (action === 'admin_change_type_select') {
        const [tournamentShortId] = params;
        const newType = interaction.values[0];

        if (newType === 'pago') {
            const modal = new ModalBuilder().setCustomId(`edit_payment_details_modal:${tournamentShortId}`).setTitle('Detalles del Torneo de Pago');
            const feeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Cuota de Inscripción (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('5');
            const prizeCInput = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('40');
            const prizeFInput = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue('0');
            modal.addComponents(new ActionRowBuilder().addComponents(feeInput), new ActionRowBuilder().addComponents(prizeCInput), new ActionRowBuilder().addComponents(prizeFInput));
            await interaction.showModal(modal);
        } else {
            await interaction.deferUpdate();
            await updateTournamentConfig(interaction.client, tournamentShortId, { isPaid: false, entryFee: 0, prizeCampeon: 0, prizeFinalista: 0 });
            await interaction.editReply({ content: `✅ Torneo actualizado a: **Gratuito**.`, components: [] });
        }
    } else if (action === 'invite_cocaptain_select') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        const captainId = interaction.user.id;
        const team = tournament.teams.aprobados[captainId];
        if (!team) return interaction.editReply({ content: 'Error: No eres el capitán de un equipo en este torneo.' });
        // if (team.coCaptainId) return interaction.editReply({ content: 'Ya tienes un co-capitán.' }); // REMOVED to allow replacement

        const coCaptainId = interaction.values[0];
        const coCaptainUser = await client.users.fetch(coCaptainId);

        const allCaptainsAndCoCaptains = Object.values(tournament.teams.aprobados).flatMap(t => [t.capitanId, t.coCaptainId]).filter(Boolean);
        if (allCaptainsAndCoCaptains.includes(coCaptainId)) {
            return interaction.editReply({ content: '❌ Esta persona ya participa en el torneo como capitán o co-capitán.' });
        }
        if (coCaptainUser.bot) {
            return interaction.editReply({ content: 'No puedes invitar a un bot.' });
        }

        try {
            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.coCapitanes.${captainId}`]: { inviterId: captainId, invitedId: coCaptainId, invitedAt: new Date() } } }
            );

            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`🤝 Invitación de Co-Capitán / Co-Captain Invitation`)
                .setDescription(`🇪🇸 Has sido invitado por **${interaction.user.tag}** para ser co-capitán de su equipo **${team.nombre}** en el torneo **${tournament.nombre}**.\n*Si aceptas, reemplazarás al co-capitán actual si lo hay.*\n\n` +
                    `🇬🇧 You have been invited by **${interaction.user.tag}** to be the co-captain of their team **${team.nombre}** in the **${tournament.nombre}** tournament.\n*If you accept, you will replace the current co-captain if there is one.*`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`cocaptain_accept:${tournament.shortId}:${captainId}:${coCaptainId}`).setLabel('Aceptar / Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`cocaptain_reject:${tournament.shortId}:${captainId}:${coCaptainId}`).setLabel('Rechazar / Reject').setStyle(ButtonStyle.Danger)
            );

            await coCaptainUser.send({ embeds: [embed], components: [row] });
            await interaction.editReply({ content: `✅ 🇪🇸 Invitación enviada a **${coCaptainUser.tag}**. Recibirá un MD para aceptar o rechazar.\n🇬🇧 Invitation sent to **${coCaptainUser.tag}**. They will receive a DM to accept or reject.`, components: [] });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ No se pudo enviar el MD de invitación. Es posible que el usuario tenga los mensajes directos bloqueados.', components: [] });
        }
    }
    if (action === 'admin_promote_from_waitlist') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const captainIdToPromote = interaction.values[0];

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.followUp({ content: 'Error: Torneo no encontrado.', flags: [MessageFlags.Ephemeral] });
        }

        const teamData = tournament.teams.reserva[captainIdToPromote];
        if (!teamData) {
            return interaction.followUp({ content: 'Error: Este equipo ya no está en la lista de reserva.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            await approveTeam(client, tournament, teamData);
            await interaction.editReply({
                content: `✅ El equipo **${teamData.nombre}** ha sido aprobado y movido de la reserva al torneo.`,
                components: []
            });
        } catch (error) {
            console.error("Error al promover equipo desde la reserva:", error);
            await interaction.followUp({ content: `❌ Hubo un error al aprobar al equipo: ${error.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
    }
    if (action === 'verify_select_platform_manual') {
        // --- MODIFICACIÓN CLAVE ---
        const [draftShortId] = params;
        const platform = interaction.values[0];
        const modal = new ModalBuilder()
            // Pasamos el ID del draft al modal final
            .setCustomId(`verification_ticket_submit:${platform}:${draftShortId}`)
            .setTitle('Verificación - Datos del Jugador');

        const gameIdInput = new TextInputBuilder()
            .setCustomId('game_id_input')
            .setLabel(`Tu ID en ${platform.toUpperCase()}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const twitterInput = new TextInputBuilder()
            .setCustomId('twitter_input')
            .setLabel("Tu usuario de Twitter (sin @)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const whatsappInput = new TextInputBuilder()
            .setCustomId('whatsapp_input')
            .setLabel("Tu WhatsApp (Ej: +34 123456789)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const whatsappConfirmInput = new TextInputBuilder()
            .setCustomId('whatsapp_confirm_input')
            .setLabel("Confirma tu WhatsApp (Escríbelo de nuevo)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gameIdInput),
            new ActionRowBuilder().addComponents(twitterInput),
            new ActionRowBuilder().addComponents(whatsappInput),
            new ActionRowBuilder().addComponents(whatsappConfirmInput)
        );
        return interaction.showModal(modal);
    }

    if (action === 'reject_verification_reason') {
        await interaction.deferUpdate();
        const [channelId] = params;
        const reason = interaction.values[0];
        const db = getDb();
        const ticket = await db.collection('verificationtickets').findOne({ channelId });

        // --- AÑADE ESTE BLOQUE PARA BORRAR LA NOTIFICACIÓN ---
        if (ticket.adminNotificationMessageId) {
            try {
                const adminApprovalChannel = await client.channels.fetch(ADMIN_APPROVAL_CHANNEL_ID);
                const notificationMessage = await adminApprovalChannel.messages.fetch(ticket.adminNotificationMessageId);
                await notificationMessage.delete();
            } catch (error) {
                console.warn(`[CLEANUP] No se pudo borrar el mensaje de notificación del ticket ${ticket._id}. Puede que ya no existiera.`, error.message);
            }
        }
        // --- FIN DEL BLOQUE A AÑADIR ---

        let reasonText = '';
        if (reason === 'inactivity') {
            reasonText = 'Tu solicitud de verificación ha sido rechazada debido a inactividad. No has proporcionado las pruebas necesarias en el tiempo establecido.';
        } else {
            reasonText = 'Tu solicitud de verificación ha sido rechazada porque las pruebas proporcionadas eran insuficientes o no válidas. Por favor, asegúrate de seguir las instrucciones correctamente si lo intentas de nuevo.';
        }

        const user = await client.users.fetch(ticket.userId).catch(() => null);
        if (user) {
            try {
                await user.send(`❌ **Verificación Rechazada**\n\n${reasonText}`);
            } catch (e) { console.warn(`No se pudo enviar MD de rechazo al usuario ${user.id}`); }
        }

        await db.collection('verificationtickets').updateOne({ _id: ticket._id }, { $set: { status: 'closed' } });
        const channel = await client.channels.fetch(channelId);
        await channel.send(`❌ Verificación rechazada por <@${interaction.user.id}>. Motivo: ${reason === 'inactivity' ? 'Inactividad' : 'Pruebas insuficientes'}. Este canal se cerrará en 10 segundos.`);

        const originalMessage = await channel.messages.fetch(interaction.message.reference.messageId);
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        const finalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        finalEmbed.data.fields.find(f => f.name === 'Estado').value = `❌ **Rechazado por:** <@${interaction.user.id}>`;
        await originalMessage.edit({ embeds: [finalEmbed], components: [disabledRow] });

        await interaction.editReply({ content: 'Rechazo procesado.', components: [] });
        setTimeout(() => channel.delete().catch(console.error), 10000);
    }
    if (action === 'admin_edit_verified_user_select') {
        const userId = interaction.values[0];
        const db = getDb();

        const userRecord = await db.collection('verified_users').findOne({ discordId: userId });
        if (!userRecord) {
            return interaction.update({ content: '❌ Este usuario no tiene un perfil verificado en la base de datos.', components: [], embeds: [] });
        }

        let playerRecord = await db.collection('player_records').findOne({ userId: userId });
        const currentStrikes = playerRecord ? playerRecord.strikes : 0;

        const user = await client.users.fetch(userId);

        const embed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle(`✏️ Editando Perfil de ${user.tag}`)
            .setDescription('**Datos Actuales:**')
            .addFields(
                { name: 'ID de Juego', value: `\`${userRecord.gameId}\``, inline: true },
                { name: 'Plataforma', value: `\`${userRecord.platform.toUpperCase()}\``, inline: true },
                { name: 'Twitter', value: `\`${userRecord.twitter}\``, inline: true },
                { name: 'WhatsApp', value: `\`${userRecord.whatsapp || 'No registrado'}\``, inline: true }, // <-- LÍNEA AÑADIDA
                { name: 'Strikes Actuales', value: `\`${currentStrikes}\``, inline: true }
            )
            .setFooter({ text: 'Por favor, selecciona el campo que deseas modificar.' });

        const fieldMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_edit_verified_field_select:${userId}`)
            .setPlaceholder('Selecciona el dato a cambiar')
            .addOptions([
                { label: 'ID de Juego', value: 'gameId' },
                { label: 'Twitter', value: 'twitter' },
                { label: 'WhatsApp', value: 'whatsapp' }, // <-- LÍNEA AÑADIDA
                { label: 'Strikes', value: 'strikes' }
            ]);

        return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(fieldMenu)], content: '' });
    }

    if (action === 'admin_edit_verified_field_select') {
        const [userId] = params;
        const fieldToEdit = interaction.values[0];

        // Si es cualquiera de estos tres, usamos el mismo modal
        if (['gameId', 'twitter', 'whatsapp'].includes(fieldToEdit)) {
            const modal = new ModalBuilder()
                .setCustomId(`admin_edit_verified_submit:${userId}:${fieldToEdit}`)
                .setTitle(`Cambiar ${fieldToEdit}`);
            const newValueInput = new TextInputBuilder().setCustomId('new_value_input').setLabel("Nuevo Valor").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(newValueInput));
            return interaction.showModal(modal);

        } else if (fieldToEdit === 'strikes') {
            const modal = new ModalBuilder()
                .setCustomId(`admin_edit_strikes_submit:${userId}`)
                .setTitle(`Establecer Strikes`);
            const strikesInput = new TextInputBuilder().setCustomId('strikes_input').setLabel("Nuevo número total de strikes").setStyle(TextInputStyle.Short).setPlaceholder("Ej: 0, 1, 2...").setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(strikesInput));
            return interaction.showModal(modal);
        }
    }
    if (action === 'consult_player_data_select') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [draftShortId] = params;
        const selectedUserId = interaction.values[0];

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const user = await client.users.fetch(selectedUserId);

        const verifiedData = await db.collection('verified_users').findOne({ discordId: selectedUserId });
        const draftPlayerData = draft.players.find(p => p.userId === selectedUserId);

        if (!verifiedData && !draftPlayerData) {
            return interaction.editReply({ content: `❌ El usuario ${user.tag} no está ni verificado ni inscrito en este draft.` });
        }

        const embed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle(`ℹ️ Ficha de Datos: ${user.tag}`)
            .setThumbnail(user.displayAvatarURL());

        if (verifiedData) {
            embed.addFields(
                { name: '📋 Datos de Verificación', value: '\u200B' },
                { name: 'ID de Juego', value: `\`${verifiedData.gameId}\``, inline: true },
                { name: 'Plataforma', value: `\`${verifiedData.platform.toUpperCase()}\``, inline: true },
                { name: 'Twitter', value: `\`${verifiedData.twitter}\``, inline: true },
                { name: 'WhatsApp', value: `\`${verifiedData.whatsapp || 'No registrado'}\``, inline: true }
            );
        } else {
            embed.addFields({ name: '📋 Datos de Verificación', value: 'El usuario no está verificado.' });
        }

        if (draftPlayerData) {
            const captain = draftPlayerData.captainId ? draft.captains.find(c => c.userId === draftPlayerData.captainId) : null;
            embed.addFields(
                { name: '📝 Datos del Draft Actual', value: '\u200B' },
                { name: 'Posición Primaria', value: `\`${draftPlayerData.primaryPosition}\``, inline: true },
                { name: 'Posición Secundaria', value: `\`${draftPlayerData.secondaryPosition || 'N/A'}\``, inline: true },
                { name: 'Equipo Actual (Club)', value: `\`${draftPlayerData.currentTeam || 'N/A'}\``, inline: true },
                { name: 'Fichado por (Draft)', value: captain ? `\`${captain.teamName}\`` : '`Agente Libre`', inline: true }
            );
        } else {
            embed.addFields({ name: '📝 Datos del Draft Actual', value: 'El usuario no está inscrito en este draft.' });
        }

        await interaction.editReply({ embeds: [embed] });
        return;
    }
    if (action === 'admin_select_channel_to_update_icon') {
        const channelId = interaction.values[0];
        const statusMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_set_channel_icon:${channelId}`)
            .setPlaceholder('Paso 2: Selecciona el estado del canal')
            .addOptions([
                { label: 'Verde (Inscripciones Abiertas)', value: '🟢', emoji: '🟢' },
                { label: 'Azul (En Juego / Lleno)', value: '🔵', emoji: '🔵' },
                { label: 'Rojo (Inactivo)', value: '🔴', emoji: '🔴' }
            ]);

        const row = new ActionRowBuilder().addComponents(statusMenu);

        await interaction.update({
            content: 'Canal seleccionado. Ahora, elige el icono de estado que quieres establecer:',
            components: [row]
        });
        return;
    }
    else if (action === 'admin_create_match_type') {
        const [formatId, type] = params;
        const matchType = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`create_tournament:${formatId}:${type}:${matchType}`)
            .setTitle('Finalizar Creación de Torneo');

        const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
        const startTimeInput = new TextInputBuilder().setCustomId('torneo_start_time').setLabel("Fecha/Hora de Inicio (ej: Sáb 20, 22:00 CET)").setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(nombreInput), new ActionRowBuilder().addComponents(startTimeInput));

        if (type === 'pago') {
            modal.setTitle('Finalizar Creación (De Pago)');

            const entryFeeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Inscripción por Equipo (€)").setStyle(TextInputStyle.Short).setRequired(true);

            // CAMBIO 1: Premios combinados en un solo campo
            const prizesInput = new TextInputBuilder()
                .setCustomId('torneo_prizes')
                .setLabel("Premios: Campeón / Finalista (€)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Ej: 100/50  (Si no hay para finalista, pon 100/0)');

            // CAMBIO 2: Métodos de pago combinados en un solo campo
            const paymentMethodsInput = new TextInputBuilder()
                .setCustomId('torneo_payment_methods')
                .setLabel("Métodos Pago: PayPal / Bizum")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder('Ej: mi@email.com / 600111222');

            modal.addComponents(
                new ActionRowBuilder().addComponents(entryFeeInput),
                new ActionRowBuilder().addComponents(prizesInput),
                new ActionRowBuilder().addComponents(paymentMethodsInput)
            );
        }
        await interaction.showModal(modal);
    }
    // --- NUEVOS BLOQUES DE CÓDIGO ---

    // Maneja la selección de "Primaria" o "Secundaria"
    if (action === 'free_agent_search_type') {
        await interaction.deferUpdate();
        const [draftShortId] = params;
        const searchType = interaction.values[0];

        const positionOptions = Object.entries(DRAFT_POSITIONS).map(([key, value]) => ({
            label: value,
            value: key
        }));

        const positionMenu = new StringSelectMenuBuilder()
            .setCustomId(`free_agent_select_position:${draftShortId}:${searchType}`)
            .setPlaceholder(`Paso 2: Elige la posición ${searchType === 'primary' ? 'primaria' : 'secundaria'}`)
            .addOptions(positionOptions);

        await interaction.editReply({
            content: `Buscaremos por posición ${searchType === 'primary' ? 'primaria' : 'secundaria'}. Ahora, selecciona la posición exacta:`,
            components: [new ActionRowBuilder().addComponents(positionMenu)]
        });
        return;
    }

    // Maneja la selección de la posición y muestra la lista paginada
    if (action === 'free_agent_select_position' || action === 'free_agent_select_page') {
        await interaction.deferUpdate();
        const [draftShortId, searchType, position, pageStr] = params;
        const page = action === 'free_agent_select_page' ? parseInt(interaction.values[0].replace('page_', '')) : 0;
        const selectedPosition = action === 'free_agent_select_position' ? interaction.values[0] : position;

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const freeAgents = draft.players.filter(p => !p.captainId && !p.isCaptain);

        const candidates = freeAgents.filter(p =>
            (searchType === 'primary' && p.primaryPosition === selectedPosition) ||
            (searchType === 'secondary' && p.secondaryPosition === selectedPosition)
        );

        if (candidates.length === 0) {
            return interaction.editReply({
                content: `No se encontraron agentes libres para la posición **${DRAFT_POSITIONS[selectedPosition]}** (${searchType}).`,
                components: []
            });
        }

        candidates.sort((a, b) => a.psnId.localeCompare(b.psnId));
        const pageSize = 25;
        const pageCount = Math.ceil(candidates.length / pageSize);
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        const candidatesPage = candidates.slice(startIndex, endIndex);

        const playerOptions = candidatesPage.map(p => ({
            label: p.psnId,
            description: `Pos: ${p.primaryPosition} / ${p.secondaryPosition || 'N/A'}`,
            value: p.userId
        }));

        const playerMenu = new StringSelectMenuBuilder()
            .setCustomId(`view_free_agent_details:${draftShortId}`)
            .setPlaceholder(`Pág. ${page + 1}/${pageCount} - Selecciona un jugador para ver su ficha`)
            .addOptions(playerOptions);

        const components = [new ActionRowBuilder().addComponents(playerMenu)];

        if (pageCount > 1) {
            const pageOptions = [];
            for (let i = 0; i < pageCount; i++) {
                pageOptions.push({ label: `Página ${i + 1} de ${pageCount}`, value: `page_${i}` });
            }
            const pageMenu = new StringSelectMenuBuilder()
                .setCustomId(`free_agent_select_page:${draftShortId}:${searchType}:${selectedPosition}`)
                .setPlaceholder('Cambiar de página')
                .addOptions(pageOptions);
            components.unshift(new ActionRowBuilder().addComponents(pageMenu));
        }

        await interaction.editReply({
            content: `Mostrando **${candidates.length}** agentes libres para **${DRAFT_POSITIONS[selectedPosition]}** (${searchType}).`,
            components
        });
        return;
    }

    // Maneja la selección final del jugador y muestra su ficha
    if (action === 'view_free_agent_details') {
        await interaction.deferUpdate();
        const [draftShortId] = params;
        const selectedPlayerId = interaction.values[0];

        const draft = await db.collection('drafts').findOne({ shortId: draftShortId });
        const player = draft.players.find(p => p.userId === selectedPlayerId);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        const playerViewEmbed = await createPlayerManagementEmbed(interaction.client, player, draft, null, isAdmin, 'view');
        await interaction.editReply(playerViewEmbed);
        return;
    }
    if (action === 'admin_select_registered_team_to_add') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const selectedTeamId = interaction.values[0];

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const team = await getDb('test').collection('teams').findOne({ _id: new ObjectId(selectedTeamId) });
        const manager = await client.users.fetch(team.managerId).catch(() => null);

        if (!tournament || !team || !manager) {
            return interaction.editReply({ content: 'Error: No se pudo encontrar el torneo, el equipo o el mánager en Discord.', components: [] });
        }

        // --- INICIO DE LA NUEVA LÓGICA ---
        // 1. Buscamos el último torneo en el que participó el equipo para encontrar su stream.
        const previousTournament = await db.collection('tournaments').findOne(
            { [`teams.aprobados.${team.managerId}`]: { $exists: true } }, // Buscamos torneos donde el equipo estuvo aprobado
            {
                sort: { _id: -1 }, // Ordenamos por el más reciente
                projection: { [`teams.aprobados.${team.managerId}.streamChannel`]: 1 } // Solo necesitamos el campo del stream
            }
        );

        // 2. Extraemos la URL del stream si existe. Si no, será null.
        const lastStreamUrl = previousTournament ? previousTournament.teams.aprobados[team.managerId]?.streamChannel : null;

        // 3. Identificar capitanes adicionales (excluyendo al manager si está en la lista)
        const extraCaptains = (team.captains || []).filter(id => id !== team.managerId);
        // --- FIN DE LA NUEVA LÓGICA ---


        // Preparamos los datos del equipo como si se hubiera inscrito él mismo
        const teamData = {
            id: team.managerId,
            nombre: team.name,
            eafcTeamName: team.name,
            capitanId: team.managerId,
            capitanTag: manager.tag,
            logoUrl: team.logoUrl,
            twitter: team.twitterHandle,
            // 3. Usamos la URL encontrada (o null si no hay) al crear los datos del equipo.
            streamChannel: lastStreamUrl,
            paypal: null,
            inscritoEn: new Date(),
            extraCaptains: extraCaptains // Pasamos todos los capitanes como extra
        };

        try {
            await approveTeam(client, tournament, teamData);

            // Mensaje de confirmación mejorado para el admin
            let confirmationMessage = lastStreamUrl
                ? `✅ El equipo **${team.name}** ha sido inscrito con éxito. Se ha reutilizado su último canal de stream: ${lastStreamUrl}`
                : `✅ El equipo **${team.name}** ha sido inscrito con éxito. No se encontró un stream anterior para reutilizar.`;

            if (extraCaptains.length > 0) {
                const mentions = extraCaptains.map(id => `<@${id}>`).join(', ');
                confirmationMessage += `\nℹ️ Capitanes adicionales (permisos): ${mentions}`;
            }

            await interaction.editReply({ content: confirmationMessage, components: [] });

        } catch (error) {
            console.error("Error al añadir equipo registrado:", error);
            await interaction.editReply({ content: `❌ Hubo un error al inscribir al equipo: ${error.message}`, components: [] });
        }
        return;
    }
    if (action === 'admin_select_team_page') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const selectedPage = parseInt(interaction.values[0].replace('page_', ''));

        const allTeams = await getDb('test').collection('teams').find({ guildId: interaction.guildId }).toArray();
        allTeams.sort((a, b) => a.name.localeCompare(b.name));

        const pageSize = 25;
        const pageCount = Math.ceil(allTeams.length / pageSize);

        const startIndex = selectedPage * pageSize;
        const teamsOnPage = allTeams.slice(startIndex, startIndex + pageSize);

        const teamOptions = teamsOnPage.map(team => ({
            label: team.name,
            description: `Manager ID: ${team.managerId}`,
            value: team._id.toString()
        }));

        const teamSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_registered_team_to_add:${tournamentShortId}`)
            .setPlaceholder(`Paso 1: Selecciona equipo (Pág. ${selectedPage + 1})`)
            .addOptions(teamOptions);

        const pageOptions = [];
        for (let i = 0; i < pageCount; i++) {
            const startNum = i * pageSize + 1;
            const endNum = Math.min((i + 1) * pageSize, allTeams.length);
            pageOptions.push({
                label: `Página ${i + 1} (${startNum}-${endNum})`,
                value: `page_${i}`
            });
        }
        const pageSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_team_page:${tournamentShortId}`)
            .setPlaceholder('Paso 2: Cambiar de página')
            .addOptions(pageOptions);

        await interaction.editReply({
            content: `Mostrando ${teamsOnPage.length} de ${allTeams.length} equipos registrados. Por favor, selecciona un equipo:`,
            components: [
                new ActionRowBuilder().addComponents(teamSelectMenu),
                new ActionRowBuilder().addComponents(pageSelectMenu)
            ]
        });
        return;
    }


    if (action === 'admin_search_team_page_select') {
        await interaction.deferUpdate();
        const [tournamentShortId, searchQuery] = params;
        const selectedPage = parseInt(interaction.values[0].replace('page_', ''));

        const allTeams = await getDb('test').collection('teams').find({ guildId: interaction.guildId }).toArray();
        // Filtramos de nuevo usando la query guardada
        const filteredTeams = allTeams.filter(t => t.name.toLowerCase().includes(searchQuery));
        filteredTeams.sort((a, b) => a.name.localeCompare(b.name));

        const pageSize = 25;
        const pageCount = Math.ceil(filteredTeams.length / pageSize);

        const startIndex = selectedPage * pageSize;
        const teamsOnPage = filteredTeams.slice(startIndex, startIndex + pageSize);

        const teamOptions = teamsOnPage.map(team => ({
            label: team.name,
            description: `Manager ID: ${team.managerId}`,
            value: team._id.toString()
        }));

        const teamSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_registered_team_to_add:${tournamentShortId}`)
            .setPlaceholder(`Paso 1: Selecciona equipo (Pág. ${selectedPage + 1})`)
            .addOptions(teamOptions);

        const pageOptions = [];
        for (let i = 0; i < pageCount; i++) {
            const startNum = i * pageSize + 1;
            const endNum = Math.min((i + 1) * pageSize, filteredTeams.length);
            pageOptions.push({
                label: `Página ${i + 1} (${startNum}-${endNum})`,
                value: `page_${i}`
            });
        }
        const pageSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_search_team_page_select:${tournamentShortId}:${searchQuery}`)
            .setPlaceholder('Paso 2: Cambiar de página')
            .addOptions(pageOptions);

        await interaction.editReply({
            content: `Mostrando ${teamsOnPage.length} de ${filteredTeams.length} equipos para "**${searchQuery}**".`,
            components: [
                new ActionRowBuilder().addComponents(teamSelectMenu),
                new ActionRowBuilder().addComponents(pageSelectMenu)
            ]
        });
        return;
    }

    if (action === 'admin_kick_team_select') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const captainIdToKick = interaction.values[0];

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const teamData = tournament.teams.aprobados[captainIdToKick];

        if (!teamData) {
            return interaction.editReply({ content: '❌ Error: Este equipo ya no parece estar en el torneo.' });
        }

        await kickTeam(client, tournament, captainIdToKick);

        try {
            const user = await client.users.fetch(captainIdToKick);
            await user.send(`🚨 Has sido **expulsado** del torneo **${tournament.nombre}** por un administrador.`);
        } catch (e) {
            console.warn(`No se pudo enviar MD de expulsión al usuario ${captainIdToKick}`);
        }

        await interaction.editReply({
            content: `✅ El equipo **${teamData.nombre}** ha sido expulsado con éxito del torneo.`,
            components: [] // Quitamos el menú desplegable
        });
        return;
    }

    // NUEVO: Paso intermedio para seleccionar partidos del equipo elegido
    if (action === 'admin_reopen_select_team') {
        await interaction.deferUpdate();
        const [tournamentShortId] = params;
        const selectedTeamId = interaction.values[0];

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        // Filtrar partidos finalizados donde participa este equipo
        const allMatches = [
            ...Object.values(tournament.structure.calendario || {}).flat(),
            ...Object.values(tournament.structure.eliminatorias || {}).flat()
        ];

        const teamCompletedMatches = allMatches.filter(match =>
            match &&
            match.status === 'finalizado' &&
            (match.equipoA.id === selectedTeamId || match.equipoB.id === selectedTeamId)
        );

        if (teamCompletedMatches.length === 0) {
            return interaction.editReply({
                content: 'Este equipo no tiene partidos finalizados que reabrir.',
                components: []
            });
        }

        const matchOptions = teamCompletedMatches.map(match => {
            const stage = match.nombreGrupo ? `${match.nombreGrupo} - J${match.jornada}` : match.jornada;
            return {
                label: `${stage}: ${match.equipoA.nombre} vs ${match.equipoB.nombre}`,
                description: `Resultado: ${match.resultado}`,
                value: match.matchId,
            };
        }).slice(0, 25);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_reopen_match_select:${tournamentShortId}`)
            .setPlaceholder('Paso 2: Selecciona el partido')
            .addOptions(matchOptions);

        await interaction.editReply({
            content: `Selecciona el partido que deseas reabrir (${teamCompletedMatches.length} partidos finalizados encontrados):`,
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
    }

    // Bloque 1: Lógica para Reabrir Partido
    if (action === 'admin_reopen_match_select') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const matchId = interaction.values[0];

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const { partido } = findMatch(tournament, matchId);

        if (!partido) {
            return interaction.editReply({ content: '❌ Error: El partido seleccionado ya no existe.' });
        }

        await revertStats(tournament, partido);

        partido.resultado = null;
        partido.status = 'pendiente';
        partido.reportedScores = {};

        const newThreadId = await createMatchThread(client, guild, partido, tournament.discordChannelIds.matchesChannelId, tournament.shortId);
        partido.threadId = newThreadId;
        partido.status = 'en_curso';

        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { "structure": tournament.structure } });

        const updatedTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
        await updatePublicMessages(client, updatedTournament);
        await notifyTournamentVisualizer(updatedTournament);

        await interaction.editReply({ content: `✅ ¡Partido reabierto! Se ha creado un nuevo hilo para el encuentro: <#${newThreadId}>` });
        return;
    }

    // Bloque 2: Lógica para mostrar el formulario de Modificar Resultado
    if (action === 'admin_modify_final_result_select') {
        const [tournamentShortId] = params;
        const matchId = interaction.values[0];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const { partido } = findMatch(tournament, matchId);

        if (!partido) {
            return interaction.reply({ content: 'Error: Partido no encontrado.', flags: [MessageFlags.Ephemeral] });
        }

        const [golesA_actual = '', golesB_actual = ''] = partido.resultado ? partido.resultado.split('-') : [];

        const modal = new ModalBuilder()
            .setCustomId(`admin_modify_final_result_modal:${tournamentShortId}:${matchId}`)
            .setTitle('Modificar Resultado Final');

        const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setValue(golesA_actual).setRequired(true);
        const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setValue(golesB_actual).setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        await interaction.showModal(modal);
        return;
    }

    if (action === 'admin_select_league_mode') {
        const [type] = params; // 'pago' o 'gratis'
        const leagueMode = interaction.values[0]; // 'all_vs_all' o 'custom_rounds'

        const modal = new ModalBuilder()
            .setCustomId(`create_flexible_league_submit:${type}:${leagueMode}`)
            .setTitle('Configurar Liguilla');

        const nameInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
        const qualifiersInput = new TextInputBuilder()
            .setCustomId('torneo_qualifiers')
            .setLabel("Nº Clasifican (Pon 0 para Liga Pura)") // <--- CAMBIO AQUÍ
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("0 = Gana el 1º. Si no: 2, 4, 8, 16...") // <--- AYUDA VISUAL
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(qualifiersInput));

        // Si es "custom_rounds", necesitamos preguntar cuántas rondas
        if (leagueMode === 'custom_rounds') {
            const roundsInput = new TextInputBuilder()
                .setCustomId('custom_rounds_input')
                .setLabel("Nº de Partidos por Equipo")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Ej: 3")
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(roundsInput));
        }

        // Preguntamos Ida o Vuelta
        const legsInput = new TextInputBuilder()
            .setCustomId('match_legs_input')
            .setLabel("¿Ida y Vuelta? (Escribe SI o NO)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("SI = Ida y Vuelta, NO = Solo Ida")
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(legsInput));

        if (type === 'pago') {
            const entryFeeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Inscripción (€)").setStyle(TextInputStyle.Short).setRequired(true);
            const prizesInput = new TextInputBuilder().setCustomId('torneo_prizes').setLabel("Premios Camp/Sub (€)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100/50');
            modal.addComponents(new ActionRowBuilder().addComponents(entryFeeInput));
            modal.addComponents(new ActionRowBuilder().addComponents(prizesInput));
        }

        await interaction.showModal(modal);
        return;
    }


    if (action === 'admin_assign_cocaptain_team_select') {
        const [tournamentShortId] = params;
        const captainId = interaction.values[0];

        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`admin_assign_cocaptain_user_select:${tournamentShortId}:${captainId}`)
            .setPlaceholder('Selecciona al nuevo co-capitán')
            .setMaxValues(1);

        await interaction.update({
            content: `Has seleccionado el equipo. Ahora elige al usuario que será el nuevo co-capitán (esto reemplazará al actual si existe):`,
            components: [new ActionRowBuilder().addComponents(userSelect)]
        });
        return;
    }

    if (action === 'admin_assign_cocaptain_user_select') {
        await interaction.deferUpdate();
        const [tournamentShortId, captainId] = params;
        const coCaptainId = interaction.values[0];

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        const coCaptainUser = await client.users.fetch(coCaptainId);
        if (coCaptainUser.bot) return interaction.editReply({ content: 'No puedes asignar a un bot.' });

        try {
            // Usamos la misma función que el flujo normal, que ya maneja reemplazos
            await addCoCaptain(client, tournament, captainId, coCaptainId);

            await interaction.editReply({ content: `✅ **${coCaptainUser.tag}** ha sido asignado como co-capitán del equipo.`, components: [] });

            // Notificamos al nuevo co-capitán
            const team = tournament.teams.aprobados[captainId];
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle(`✅ Asignación de Co-Capitanía / Co-Captain Assignment`)
                .setDescription(`🇪🇸 Un administrador te ha asignado como co-capitán del equipo **${team.nombre}** en el torneo **${tournament.nombre}**.\n\n🇬🇧 An admin has assigned you as co-captain of team **${team.nombre}** in the **${tournament.nombre}** tournament.`);
            await coCaptainUser.send({ embeds: [embed] }).catch(() => { });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Error al asignar co-capitán: ${error.message}`, components: [] });
        }
        return;

    }

    if (action === 'admin_manual_register_user_select') {
        const [tournamentShortId] = params;
        const userId = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`admin_manual_register_modal:${tournamentShortId}:${userId}`)
            .setTitle('Inscripción Manual (Pago)');

        const teamNameInput = new TextInputBuilder()
            .setCustomId('team_name_input')
            .setLabel("Nombre del Equipo")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const paymentRefInput = new TextInputBuilder()
            .setCustomId('payment_ref_input')
            .setLabel("Método de Pago / Referencia")
            .setPlaceholder("Ej: Bizum, PayPal, Efectivo...")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const streamInput = new TextInputBuilder()
            .setCustomId('stream_input')
            .setLabel("Canal de Stream (Opcional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(teamNameInput),
            new ActionRowBuilder().addComponents(paymentRefInput),
            new ActionRowBuilder().addComponents(streamInput)
        );

        await interaction.showModal(modal);
        return;
    }
}

