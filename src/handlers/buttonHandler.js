// src/handlers/buttonHandler.js
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, ARBITRO_ROLE_ID } from '../../config.js';
import { approveTeam, startGroupStage, endTournament } from '../logic/tournamentLogic.js';
import { findMatch, simulateAllPendingMatches } from '../logic/matchLogic.js';
import { updateAdminPanel } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { updateMatchThreadName } from '../utils/tournamentUtils.js';

export async function handleButton(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    
    const [action, ...params] = customId.split(':');

    if (action === 'user_view_participants') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');

        const approvedTeams = Object.values(tournament.teams.aprobados);
        let teamList = 'Aún no hay equipos inscritos. / No teams registered yet.';
        if (approvedTeams.length > 0) {
            teamList = approvedTeams.map((team, index) => `${index + 1}. **${team.nombre}** (Cap: ${team.capitanTag}, EAFC: \`${team.eafcTeamName}\`)`).join('\n');
        }

        const embed = new EmbedBuilder().setColor('#3498db').setTitle(`Participantes: ${tournament.nombre}`).setDescription(teamList);
        
        try {
            await interaction.user.send({ embeds: [embed] });
            await interaction.editReply('✅ Te he enviado la lista de participantes por Mensaje Directo.');
        } catch (e) {
            await interaction.editReply('❌ No he podido enviarte un MD. Asegúrate de que tus mensajes directos no estén bloqueados.');
        }
        return;
    }

    const modalActions = ['inscribir_equipo_start', 'admin_modify_result_start', 'payment_confirm_start', 'admin_add_test_teams', 'admin_edit_tournament_start', 'report_result_start', 'upload_heights_start'];
    if (modalActions.includes(action)) {
        let modal;
        const [p1, p2] = params;
        const tournamentShortId = p2 || p1;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) { return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] }); }
        if (action === 'inscribir_equipo_start') {
            modal = new ModalBuilder().setCustomId(`inscripcion_modal:${tournamentShortId}`).setTitle('Inscripción de Equipo / Team Registration');
            const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (en el torneo)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(15).setRequired(true);
            const eafcNameInput = new TextInputBuilder().setCustomId('eafc_team_name_input').setLabel("Nombre de tu equipo (en EAFC)").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(eafcNameInput));
        } else if (action === 'report_result_start') {
            const matchId = p1;
            const { partido } = findMatch(tournament, matchId);
            if (!partido) return interaction.reply({ content: 'Error: Partido no encontrado.', flags: [MessageFlags.Ephemeral] });
            modal = new ModalBuilder().setCustomId(`report_result_modal:${matchId}:${tournament.shortId}`).setTitle('Reportar Resultado');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        } else if (action === 'upload_heights_start') {
             const matchId = p1;
             modal = new ModalBuilder().setCustomId(`upload_heights_modal:${matchId}:${tournament.shortId}`).setTitle('Subir Vídeo de Alturas');
             const linkInput = new TextInputBuilder().setCustomId('height_link').setLabel("Enlace al vídeo (YouTube, Twitch, etc.)").setStyle(TextInputStyle.Short).setRequired(true);
             const descInput = new TextInputBuilder().setCustomId('height_description').setLabel("Descripción (opcional)").setStyle(TextInputStyle.Short).setRequired(false);
             modal.addComponents(new ActionRowBuilder().addComponents(linkInput), new ActionRowBuilder().addComponents(descInput));
        } else if (action === 'admin_modify_result_start') {
            const matchId = p1;
            const { partido } = findMatch(tournament, matchId);
            if (!partido) return interaction.reply({ content: 'Error: Partido no encontrado.', flags: [MessageFlags.Ephemeral] });
            modal = new ModalBuilder().setCustomId(`admin_force_result_modal:${matchId}:${tournament.shortId}`).setTitle('Forzar Resultado (Admin)');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        } else if (action === 'admin_add_test_teams') {
            modal = new ModalBuilder().setCustomId(`add_test_teams_modal:${tournamentShortId}`).setTitle('Añadir Equipos de Prueba');
            const amountInput = new TextInputBuilder().setCustomId('amount_input').setLabel("¿Cuántos equipos de prueba quieres añadir?").setStyle(TextInputStyle.Short).setRequired(true).setValue('1');
            modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        } else if (action === 'admin_edit_tournament_start') {
            modal = new ModalBuilder().setCustomId(`edit_tournament_modal:${tournamentShortId}`).setTitle(`Editar Premios/Cuota de ${tournament.nombre}`);
            const prizeCInput = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.config.prizeCampeon.toString());
            const prizeFInput = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.config.prizeFinalista.toString());
            const feeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Cuota de Inscripción (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.config.entryFee.toString());
            modal.addComponents(new ActionRowBuilder().addComponents(prizeCInput), new ActionRowBuilder().addComponents(prizeFInput), new ActionRowBuilder().addComponents(feeInput));
        } else if (action === 'payment_confirm_start') {
            modal = new ModalBuilder().setCustomId(`payment_confirm_modal:${tournamentShortId}`).setTitle('Confirmar Pago / Confirm Payment');
            const paypalInput = new TextInputBuilder().setCustomId('user_paypal_input').setLabel("Tu PayPal (para premios)").setStyle(TextInputStyle.Short).setPlaceholder('tu.email@ejemplo.com').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
        }
        await interaction.showModal(modal);
        return;
    }
    
    if (action === 'im_ready') {
        await interaction.deferUpdate();
        const [matchId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const { partido } = findMatch(tournament, matchId);
        if (!partido || (interaction.user.id !== partido.equipoA.capitanId && interaction.user.id !== partido.equipoB.capitanId)) return;
        const localTeam = partido.equipoA; const awayTeam = partido.equipoB;
        const invitationButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`invitation_sent:${matchId}:${tournamentShortId}`).setLabel("He Enviado la Invitación / Invitation Sent").setStyle(ButtonStyle.Success));
        await interaction.channel.send({ content: `👋 <@${interaction.user.id}> está listo para jugar. <t:${Math.floor(Date.now() / 1000)}:T>\nEl equipo local es **${localTeam.nombre}**. Su nombre en EAFC es \`${localTeam.eafcTeamName}\`.\n<@${awayTeam.capitanId}>, por favor, envía la invitación y pulsa el botón de abajo.`, components: [invitationButton] });
        const originalMessage = interaction.message;
        const newComponents = originalMessage.components.map(row => { const newRow = ActionRowBuilder.from(row); newRow.components.forEach(comp => { if (comp.customId === customId) comp.setDisabled(true); }); return newRow; });
        await originalMessage.edit({ components: newComponents });
        return;
    }

    if (action === 'invitation_sent') {
        await interaction.deferUpdate();
        const [matchId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const { partido } = findMatch(tournament, matchId);
        if (!partido || interaction.user.id !== partido.equipoB.capitanId) return;
        partido.status = 'en_juego';
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { "structure": tournament.structure } });
        await updateMatchThreadName(client, partido);
        await interaction.channel.send(`✅ <@${interaction.user.id}> ha enviado la invitación. <t:${Math.floor(Date.now() / 1000)}:T>\n¡El partido comienza ahora! ¡Mucha suerte a ambos!`);
        const originalMessage = interaction.message;
        const newComponents = originalMessage.components.map(row => { const newRow = ActionRowBuilder.from(row); newRow.components.forEach(comp => comp.setDisabled(true)); return newRow; });
        await originalMessage.edit({ components: newComponents });
        return;
    }

    if (action === 'request_referee') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [matchId, tournamentShortId] = params;
        const thread = interaction.channel;
        if (!thread.isThread()) return interaction.editReply('Esta acción solo funciona en un hilo de partido.');
        await thread.setName(`⚠️${thread.name.replace(/^[⚔️✅🔵]-/g, '')}`.slice(0,100));
        await thread.send({ content: `🛎️ <@&${ARBITRO_ROLE_ID}> Se ha solicitado arbitraje en este partido por parte de <@${interaction.user.id}>.` });
        await interaction.editReply('✅ Se ha notificado a los árbitros y el hilo ha sido marcado para revisión.');
        return;
    }

    if (action === 'admin_change_format_start') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');
        const formatMenu = new StringSelectMenuBuilder().setCustomId(`admin_change_format_select:${tournamentShortId}`).setPlaceholder('Selecciona el nuevo formato').addOptions(Object.keys(TOURNAMENT_FORMATS).map(key => ({ label: TOURNAMENT_FORMATS[key].label, value: key })));
        const typeMenu = new StringSelectMenuBuilder().setCustomId(`admin_change_type_select:${tournamentShortId}`).setPlaceholder('Selecciona el nuevo tipo de pago').addOptions([ { label: 'Gratuito', value: 'gratis' }, { label: 'De Pago', value: 'pago' } ]);
        await interaction.editReply({ content: `**Editando:** ${tournament.nombre}\nSelecciona el nuevo formato o tipo.`, components: [new ActionRowBuilder().addComponents(formatMenu), new ActionRowBuilder().addComponents(typeMenu)], });
        return;
    }

    if (action === 'admin_create_tournament_start') {
        const formatMenu = new StringSelectMenuBuilder().setCustomId('admin_create_format').setPlaceholder('Paso 1: Selecciona el formato del torneo').addOptions(Object.keys(TOURNAMENT_FORMATS).map(key => ({ label: TOURNAMENT_FORMATS[key].label, value: key })));
        await interaction.reply({ content: 'Iniciando creación de torneo...', components: [new ActionRowBuilder().addComponents(formatMenu)], flags: [MessageFlags.Ephemeral] });
        return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    if (action === 'admin_approve') {
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || !tournament.teams.pendientes[captainId]) return interaction.editReply({ content: 'Error: Solicitud no encontrada o ya procesada.' });
        await approveTeam(client, tournament, tournament.teams.pendientes[captainId]);
        const originalMessage = interaction.message;
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Aprobado por ${interaction.user.tag}`});
        await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
        await interaction.editReply(`✅ Equipo aprobado.`);
        return;
    }
    
    if (action === 'admin_force_draw') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        if (Object.keys(tournament.teams.aprobados).length < 2) return interaction.editReply({ content: 'Se necesitan al menos 2 equipos para forzar el sorteo.' });
        await interaction.editReply({ content: `⏳ Forzando sorteo para **${tournament.nombre}**...` });
        await startGroupStage(client, guild, tournament);
        await interaction.followUp({ content: '✅ Sorteo forzado y primera jornada creada.', flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'admin_simulate_matches') {
        const [tournamentShortId] = params;
        await interaction.editReply({ content: '⏳ Simulando todos los partidos pendientes... Esto puede tardar un momento.' });
        const result = await simulateAllPendingMatches(client, tournamentShortId);
        await interaction.editReply(`✅ Simulación completada. ${result.message}`);
        return;
    }
    
    if (action === 'admin_end_tournament') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: No se pudo encontrar ese torneo.' });
        await interaction.editReply({ content: `⏳ Recibido. Finalizando el torneo **${tournament.nombre}**. Los canales se borrarán en breve.` });
        await endTournament(client, tournament);
        return;
    }
}
