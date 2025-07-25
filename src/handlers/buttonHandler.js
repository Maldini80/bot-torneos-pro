// src/handlers/buttonHandler.js
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder } from 'discord.js';
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, ARBITRO_ROLE_ID } from '../../config.js';
import { approveTeam, startGroupStage, endTournament, kickTeam, notifyCaptainsOfChanges, requestUnregister, addCoCaptain } from '../logic/tournamentLogic.js';
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

    // CORRECCIÓN: Se elimina 'invite_cocaptain_start' de la lista de modales.
    const modalActions = ['admin_modify_result_start', 'payment_confirm_start', 'admin_add_test_teams', 'admin_edit_tournament_start', 'report_result_start', 'inscribir_equipo_start', 'inscribir_reserva_start'];
    if (modalActions.includes(action)) {
        const [p1, p2] = params;
        
        const tournamentShortId = action.includes('report') || action.includes('admin_modify_result') ? p2 : p1;

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] });
        }

        let modal;
        if (action === 'inscribir_equipo_start' || action === 'inscribir_reserva_start') {
            const captainId = interaction.user.id;
            const isAlreadyRegistered = tournament.teams.aprobados[captainId] || tournament.teams.pendientes[captainId] || (tournament.teams.reserva && tournament.teams.reserva[captainId]);
            if (isAlreadyRegistered) {
                return interaction.reply({ content: '❌ 🇪🇸 Ya estás inscrito o en la lista de reserva de este torneo.\n🇬🇧 You are already registered or on the waitlist for this tournament.', flags: [MessageFlags.Ephemeral] });
            }
            const modalId = action === 'inscribir_reserva_start' ? `reserva_modal:${tournamentShortId}` : `inscripcion_modal:${tournamentShortId}`;
            modal = new ModalBuilder().setCustomId(modalId).setTitle('Inscripción de Equipo / Team Registration');
            const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (para el torneo)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(20).setRequired(true);
            const eafcNameInput = new TextInputBuilder().setCustomId('eafc_team_name_input').setLabel("Nombre de tu equipo (ID en EAFC)").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(eafcNameInput));
        } else if (action === 'report_result_start') {
            const matchId = p1;
            const { partido } = findMatch(tournament, matchId);
            if (!partido) return interaction.reply({ content: 'Error: Partido no encontrado.', flags: [MessageFlags.Ephemeral] });
            modal = new ModalBuilder().setCustomId(`report_result_modal:${matchId}:${tournament.shortId}`).setTitle('Reportar Resultado');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
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
            modal = new ModalBuilder().setCustomId(`edit_tournament_modal:${tournamentShortId}`).setTitle(`Editar Torneo: ${tournament.nombre}`);
            const prizeCInput = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.config.prizeCampeon.toString());
            const prizeFInput = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.config.prizeFinalista.toString());
            const feeInput = new TextInputBuilder().setCustomId('torneo_entry_fee').setLabel("Cuota de Inscripción (€)").setStyle(TextInputStyle.Short).setRequired(true).setValue(tournament.config.entryFee.toString());
            const startTimeInput = new TextInputBuilder().setCustomId('torneo_start_time').setLabel("Fecha/Hora de Inicio (ej: Sáb 20, 22:00 CET)").setStyle(TextInputStyle.Short).setRequired(false).setValue(tournament.config.startTime || '');
            modal.addComponents(new ActionRowBuilder().addComponents(prizeCInput), new ActionRowBuilder().addComponents(prizeFInput), new ActionRowBuilder().addComponents(feeInput), new ActionRowBuilder().addComponents(startTimeInput));
        } else if (action === 'payment_confirm_start') {
            modal = new ModalBuilder().setCustomId(`payment_confirm_modal:${tournamentShortId}`).setTitle('Confirmar Pago / Confirm Payment');
            const paypalInput = new TextInputBuilder().setCustomId('user_paypal_input').setLabel("Tu PayPal (para recibir premios)").setStyle(TextInputStyle.Short).setPlaceholder('tu.email@ejemplo.com').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
        }
        await interaction.showModal(modal);
        return;
    }

    // --- ACCIONES QUE NO REQUIEREN MODAL ---

    // NUEVO: Lógica para el botón de invitar co-capitán con menú de selección
    if (action === 'invite_cocaptain_start') {
        const [tournamentShortId] = params;
        const userSelectMenu = new UserSelectMenuBuilder()
            .setCustomId(`invite_cocaptain_select:${tournamentShortId}`)
            .setPlaceholder('Busca y selecciona al usuario para invitar...')
            .setMinValues(1)
            .setMaxValues(1);
        
        const row = new ActionRowBuilder().addComponents(userSelectMenu);
        
        await interaction.reply({
            content: 'Selecciona al miembro del servidor que quieres invitar como co-capitán.',
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }
    
    if (action === 'admin_force_reset_bot') {
        const modal = new ModalBuilder().setCustomId('admin_force_reset_modal').setTitle('⚠️ CONFIRMAR RESET FORZOSO ⚠️');
        const warningText = new TextInputBuilder().setCustomId('confirmation_text').setLabel("Escribe 'CONFIRMAR RESET' para proceder").setStyle(TextInputStyle.Short).setPlaceholder('Esta acción es irreversible.').setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(warningText));
        await interaction.showModal(modal);
        return;
    }
    
    if (action === 'user_view_participants') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');
        const approvedTeams = Object.values(tournament.teams.aprobados);
        let teamList = '🇪🇸 Aún no hay equipos inscritos.\n🇬🇧 No teams have registered yet.';
        if (approvedTeams.length > 0) {
            teamList = approvedTeams.map((team, index) => {
                let teamString = `${index + 1}. **${team.nombre}** (Cap: ${team.capitanTag}`;
                if (team.coCaptainTag) teamString += `, Co-Cap: ${team.coCaptainTag}`;
                teamString += `)`;
                return teamString;
            }).join('\n');
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

    if (action === 'request_referee') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [matchId] = params;
        const thread = interaction.channel;
        if (!thread.isThread()) return interaction.editReply('Esta acción solo funciona en un hilo de partido.');
        await thread.setName(`⚠️${thread.name.replace(/^[⚔️✅]-/g, '')}`.slice(0,100));
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
    
    // --- LÓGICA DE BOTONES QUE REQUIEREN DEFER ---
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    
    if (action === 'admin_approve') {
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || (!tournament.teams.pendientes[captainId] && !tournament.teams.reserva[captainId])) {
            return interaction.editReply({ content: 'Error: Solicitud no encontrada o ya procesada.' });
        }
        const teamData = tournament.teams.pendientes[captainId] || tournament.teams.reserva[captainId];
        await approveTeam(client, tournament, teamData);
        
        const kickButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_kick:${captainId}:${tournamentShortId}`).setLabel("Expulsar del Torneo / Kick from Tournament").setStyle(ButtonStyle.Danger));
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Aprobado por ${interaction.user.tag}`}).setColor('#2ecc71');
        
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        await originalMessage.edit({ embeds: [originalEmbed], components: [kickButton] });
        await interaction.editReply(`✅ Equipo aprobado y capitán notificado.`);
        return;
    }

    if (action === 'admin_reject') {
        const [captainId, tournamentShortId] = params;
        let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const teamData = tournament.teams.pendientes[captainId] || tournament.teams.reserva[captainId];
        if (!tournament || !teamData) return interaction.editReply({ content: 'Error: Solicitud no encontrada o ya procesada.' });

        if (tournament.teams.pendientes[captainId]) delete tournament.teams.pendientes[captainId];
        if (tournament.teams.reserva && tournament.teams.reserva[captainId]) delete tournament.teams.reserva[captainId];
        
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { 'teams.pendientes': tournament.teams.pendientes, 'teams.reserva': tournament.teams.reserva }});
        
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`❌ 🇪🇸 Tu inscripción para el equipo **${teamData.nombre}** en el torneo **${tournament.nombre}** ha sido **rechazada**.\n🇬🇧 Your registration for the team **${teamData.nombre}** in the **${tournament.nombre}** tournament has been **rejected**.`);
        } catch (e) { console.warn(`No se pudo enviar MD de rechazo al usuario ${captainId}`); }
        
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Rechazado por ${interaction.user.tag}`}).setColor('#e74c3c');
        
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));

        await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
        await interaction.editReply(`❌ Equipo rechazado y capitán notificado.`);
        return;
    }
    if (action === 'admin_kick') {
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        const teamData = tournament.teams.aprobados[captainId];
        if (!teamData) return interaction.editReply({ content: 'Error: Este equipo no estaba aprobado o ya fue expulsado.' });
        
        await kickTeam(client, tournament, captainId);
        
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`🚨 🇪🇸 Has sido **expulsado** del torneo **${tournament.nombre}** por un administrador.\n🇬🇧 You have been **kicked** from the **${tournament.nombre}** tournament by an administrator.`);
        } catch (e) { console.warn(`No se pudo enviar MD de expulsión al usuario ${captainId}`); }
        
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Expulsado por ${interaction.user.tag}`}).setColor('#95a5a6');
        const originalButton = ButtonBuilder.from(originalMessage.components[0].components[0]);
        originalButton.setDisabled(true);
        const newActionRow = new ActionRowBuilder().addComponents(originalButton);
        await originalMessage.edit({ embeds: [originalEmbed], components: [newActionRow] });
        await interaction.editReply(`🚨 Equipo **${teamData.nombre}** expulsado y capitán notificado.`);
        return;
    }
    if (action === 'admin_force_draw') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        if (Object.keys(tournament.teams.aprobados).length < 2) return interaction.editReply({ content: 'Se necesitan al menos 2 equipos para forzar el sorteo.' });
        
        await interaction.editReply({ content: `✅ Orden recibida. El sorteo para **${tournament.nombre}** ha comenzado en segundo plano. Esto puede tardar varios minutos.` });
        
        startGroupStage(client, guild, tournament)
            .then(() => { if (interaction.channel) { interaction.channel.send(`🎲 ¡El sorteo para **${tournament.nombre}** ha finalizado y la Jornada 1 ha sido creada!`); } })
            .catch(error => { console.error("Error durante el sorteo en segundo plano:", error); if (interaction.channel) { interaction.channel.send(`❌ Ocurrió un error crítico durante el sorteo para **${tournament.nombre}**. Revisa los logs.`); } });
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
    if (action === 'admin_notify_changes') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        const result = await notifyCaptainsOfChanges(client, tournament);
        await interaction.editReply(result.message);
        return;
    }
    
    // --- NUEVA LÓGICA DE BOTONES ---

    if (action === 'cocaptain_accept') {
        const [tournamentShortId, captainId, coCaptainId] = params;
        if (interaction.user.id !== coCaptainId) return interaction.editReply({ content: "Esta invitación no es para ti." });

        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || !tournament.teams.coCapitanes[captainId] || tournament.teams.coCapitanes[captainId].invitedId !== coCaptainId) {
            return interaction.editReply({ content: "Esta invitación ya no es válida." });
        }
        
        await addCoCaptain(client, tournament, captainId, coCaptainId);
        
        const captainUser = await client.users.fetch(captainId);
        await captainUser.send(`✅ **${interaction.user.tag}** ha aceptado tu invitación y ahora es tu co-capitán.`);
        await interaction.editReply({ content: "✅ ¡Has aceptado la invitación! Ahora eres co-capitán." });

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ components: [disabledRow] });
    }

    if (action === 'cocaptain_reject') {
        const [tournamentShortId, captainId, coCaptainId] = params;
        if (interaction.user.id !== coCaptainId) return interaction.editReply({ content: "Esta invitación no es para ti." });

        await db.collection('tournaments').updateOne({ shortId: tournamentShortId }, { $unset: { [`teams.coCapitanes.${captainId}`]: "" } });
        
        const captainUser = await client.users.fetch(captainId);
        await captainUser.send(`❌ **${interaction.user.tag}** ha rechazado tu invitación de co-capitán.`);
        await interaction.editReply({ content: "Has rechazado la invitación." });

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ components: [disabledRow] });
    }

    if (action === 'darse_baja_start') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: "Error: Torneo no encontrado." });

        const result = await requestUnregister(client, tournament, interaction.user.id);
        await interaction.editReply({ content: result.message });
    }

    if (action === 'admin_unregister_approve') {
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: "Error: Torneo no encontrado." });
        
        const team = tournament.teams.aprobados[captainId];
        if (!team) return interaction.editReply({ content: "Este equipo ya no está inscrito." });

        await kickTeam(client, tournament, captainId);
        
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`✅ Tu solicitud de baja del torneo **${tournament.nombre}** ha sido **aprobada**.`);
        } catch (e) { console.warn('No se pudo notificar al usuario de la baja aprobada'); }
        
        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        originalEmbed.setColor('#2ecc71').setFooter({ text: `Baja aprobada por ${interaction.user.tag}` });
        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ embeds: [originalEmbed], components: [disabledRow] });

        await interaction.editReply(`✅ Baja del equipo **${team.nombre}** procesada.`);
    }

    if (action === 'admin_unregister_reject') {
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`❌ Tu solicitud de baja del torneo **${tournament.nombre}** ha sido **rechazada** por un administrador.`);
        } catch(e) { console.warn('No se pudo notificar al usuario de la baja rechazada'); }

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        originalEmbed.setColor('#e74c3c').setFooter({ text: `Baja rechazada por ${interaction.user.tag}` });
        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ embeds: [originalEmbed], components: [disabledRow] });

        await interaction.editReply(`❌ Solicitud de baja rechazada.`);
    }

    if (action === 'admin_prize_paid') {
        const [tournamentShortId, userId, prizeType] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        try {
            const user = await client.users.fetch(userId);
            await user.send(`💰 ¡Buenas noticias! El premio de **${prizeType}** del torneo **${tournament.nombre}** ha sido pagado. ¡Gracias por participar!`);
        } catch (e) {
            console.warn(`No se pudo notificar al usuario ${userId} del pago del premio.`);
        }
        
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setTitle(`✅ PAGO REALIZADO: ${prizeType.toUpperCase()}`).setColor('#2ecc71').setFooter({text: `Marcado como pagado por ${interaction.user.tag}`});
        
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        
        await originalMessage.edit({ embeds: [originalEmbed], components: [disabledRow] });
        await interaction.editReply(`✅ Pago marcado como realizado. Se ha notificado a <@${userId}>.`);
    }

    if(action === 'admin_manage_waitlist') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const waitlist = tournament.teams.reserva ? Object.values(tournament.teams.reserva) : [];
        if(waitlist.length === 0) {
            return interaction.editReply({content: 'La lista de reserva está vacía.'});
        }
        const options = waitlist.map(team => ({
            label: team.nombre,
            description: `Capitán: ${team.capitanTag}`,
            value: team.capitanId
        }));
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_promote_from_waitlist:${tournamentShortId}`)
            .setPlaceholder('Selecciona un equipo para promoverlo')
            .addOptions(options);
        
        await interaction.editReply({content: 'Selecciona un equipo de la lista de reserva para aprobarlo y añadirlo al torneo:', components: [new ActionRowBuilder().addComponents(selectMenu)]});
    }
}
