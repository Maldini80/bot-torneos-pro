// src/handlers/buttonHandler.js
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, ARBITRO_ROLE_ID } from '../../config.js';
import { approveTeam, startGroupStage, endTournament, kickTeam, notifyCaptainsOfChanges, addCoCaptain } from '../logic/tournamentLogic.js';
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

    if (action === 'admin_force_reset_bot') {
        const modal = new ModalBuilder().setCustomId('admin_force_reset_modal').setTitle('⚠️ CONFIRMAR RESET FORZOSO ⚠️');
        const warningText = new TextInputBuilder().setCustomId('confirmation_text').setLabel("Escribe 'CONFIRMAR RESET' para proceder").setStyle(TextInputStyle.Short).setPlaceholder('Esta acción es irreversible.').setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(warningText));
        await interaction.showModal(modal);
        return;
    }
    if (action === 'inscribir_equipo_start') {
        const [tournamentShortId, type] = params; // type puede ser 'reserva'
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] });
        
        const captainId = interaction.user.id;
        const isAlreadyRegistered = tournament.teams.aprobados[captainId] || tournament.teams.pendientes[captainId] || (tournament.teams.reserva && tournament.teams.reserva[captainId]);
        if (isAlreadyRegistered) {
            return interaction.reply({ content: '❌ 🇪🇸 Ya estás inscrito o en la lista de reserva de este torneo.\n🇬🇧 You are already registered or on the reserve list for this tournament.', flags: [MessageFlags.Ephemeral] });
        }
        
        const modal = new ModalBuilder().setCustomId(`inscripcion_modal:${tournamentShortId}:${type || 'normal'}`).setTitle('Inscripción de Equipo / Team Registration');
        const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre de tu equipo (para el torneo)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(20).setRequired(true);
        const eafcNameInput = new TextInputBuilder().setCustomId('eafc_team_name_input').setLabel("Nombre de tu equipo (ID en EAFC)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(eafcNameInput));
        await interaction.showModal(modal);
        return;
    }
     if (action === 'request_kick_start') {
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] });

        const captainId = interaction.user.id;
        const teamData = tournament.teams.aprobados[captainId] || tournament.teams.pendientes[captainId] || (tournament.teams.reserva && tournament.teams.reserva[captainId]);
        if (!teamData) {
            return interaction.reply({ content: '❌ No estás inscrito en este torneo.', flags: [MessageFlags.Ephemeral] });
        }
        
        const modal = new ModalBuilder().setCustomId(`request_kick_modal:${tournamentShortId}:${captainId}`).setTitle('Solicitar Expulsión');
        const reasonInput = new TextInputBuilder().setCustomId('kick_reason').setLabel("Motivo de la solicitud (opcional)").setStyle(TextInputStyle.Paragraph).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
        return;
    }
    if (action === 'user_view_participants') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');
        
        const approvedTeams = Object.values(tournament.teams.aprobados);
        let descriptionText = '';
        
        if (approvedTeams.length > 0) {
            descriptionText = approvedTeams.map((team, index) => `${index + 1}. **${team.nombre}** (Capitán: ${team.capitanTag})`).join('\n');
        } else {
            descriptionText = '🇪🇸 Aún no hay equipos inscritos.\n🇬🇧 No teams have registered yet.';
        }

        const reserveTeams = Object.values(tournament.teams.reserva || {});
        if (reserveTeams.length > 0) {
            const reserveListString = reserveTeams.map((team, index) => `${index + 1}. **${team.nombre}** (Capitán: ${team.capitanTag})`).join('\n');
            descriptionText += `\n\n**🕒 Lista de Reserva / Reserve List**\n${reserveListString}`;
        }

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`Participantes: ${tournament.nombre}`)
            .setDescription(descriptionText);

        try {
            await interaction.user.send({ embeds: [embed] });
            await interaction.editReply('✅ Te he enviado la lista de participantes por Mensaje Directo.');
        } catch (e) {
            await interaction.editReply('❌ No he podido enviarte un MD. Asegúrate de que tus mensajes directos no estén bloqueados.');
        }
        return;
    }
     if (action === 'invite_cocaptain_start') {
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return;
        const teamData = tournament.teams.aprobados[captainId];
        if (teamData && teamData.coCaptainId) {
            return interaction.reply({ content: '❌ Ya tienes un co-capitán en este torneo.', flags: [MessageFlags.Ephemeral] });
        }
        const modal = new ModalBuilder().setCustomId(`invite_cocaptain_modal:${tournamentShortId}:${captainId}`).setTitle('Invitar Co-Capitán');
        const coCaptainIdInput = new TextInputBuilder().setCustomId('cocaptain_id_input').setLabel("ID de Usuario de Discord del Co-Capitán").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(coCaptainIdInput));
        await interaction.showModal(modal);
        return;
    }

    const modalActions = ['admin_modify_result_start', 'payment_confirm_start', 'admin_add_test_teams', 'admin_edit_tournament_start', 'report_result_start'];
    if (modalActions.includes(action)) {
        let modal;
        const [p1, p2] = params;
        const tournamentShortId = p2 || p1;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.reply({ content: 'Error: No se encontró este torneo.', flags: [MessageFlags.Ephemeral] });
        if (action === 'report_result_start') {
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
    if (action === 'cocaptain_accept') {
        await interaction.deferUpdate();
        const [tournamentShortId, captainId] = params;
        const coCaptainId = interaction.user.id;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return;
        
        await addCoCaptain(client, tournament, captainId, coCaptainId);
        
        const captainUser = await client.users.fetch(captainId).catch(() => null);
        if (captainUser) await captainUser.send(`✅ ¡Tu invitación ha sido **aceptada**! <@${coCaptainId}> es ahora tu co-capitán para el torneo **${tournament.nombre}**.`);
        await interaction.editReply({ content: `✅ Has aceptado la invitación. Ahora eres co-capitán en el torneo **${tournament.nombre}**.`, components: [] });
        return;
    }
    if (action === 'cocaptain_reject') {
        await interaction.deferUpdate();
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return;

        const captainUser = await client.users.fetch(captainId).catch(() => null);
        if(captainUser) await captainUser.send(`❌ <@${interaction.user.id}> ha **rechazado** tu invitación a co-capitán para el torneo **${tournament.nombre}**.`);
        await interaction.editReply({ content: 'Has rechazado la invitación.', components: [] });
        return;
    }
     if (action === 'payment_paid_notification') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [userId, type] = params; // type es 'campeon' o 'finalista'
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
            try {
                await user.send(`💰 ¡Tu premio de **${type}** ha sido abonado! Gracias por participar en el torneo.`);
                // Desactivar botón
                const originalMessage = interaction.message;
                const newButton = ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true).setLabel(`Pago Notificado`).setStyle(ButtonStyle.Secondary);
                await originalMessage.edit({ components: [new ActionRowBuilder().addComponents(newButton)] });
                await interaction.editReply({ content: `✅ Notificación de pago enviada a ${user.tag}.`});
            } catch (e) {
                await interaction.editReply({ content: `❌ No se pudo enviar MD a ${user.tag}.`});
            }
        } else {
            await interaction.editReply({ content: '❌ No se encontró al usuario.'});
        }
        return;
    }
    
    // --- INICIO DE LA CORRECCIÓN ---
    // A partir de aquí, muchas interacciones pueden tardar, así que las diferimos.
    // Las que no necesitan defer (como admin_approve) lo manejarán internamente.
    if (['admin_approve_kick', 'admin_reject_kick', 'admin_kick', 'admin_force_draw', 'admin_simulate_matches', 'admin_end_tournament', 'admin_notify_changes'].includes(action)) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    }
    // --- FIN DE LA CORRECCIÓN ---
    
    if (action === 'admin_approve') {
        // Esta acción no se difiere aquí porque tiene su propia lógica de respuesta.
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || !tournament.teams.pendientes[captainId]) return interaction.reply({ content: 'Error: Solicitud no encontrada o ya procesada.', flags: [MessageFlags.Ephemeral] });
        const teamData = tournament.teams.pendientes[captainId];
        await approveTeam(client, tournament, teamData);
        
        const kickButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_kick:${captainId}:${tournamentShortId}`).setLabel("Expulsar del Torneo / Kick from Tournament").setStyle(ButtonStyle.Danger));
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Aprobado por ${interaction.user.tag}`}).setColor('#2ecc71');
        await originalMessage.edit({ embeds: [originalEmbed], components: [kickButton] });
        await interaction.reply({ content: `✅ Equipo aprobado y capitán notificado.`, flags: [MessageFlags.Ephemeral] });
        return;
    }
    if (action === 'admin_reject') {
        const [captainId, tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || !tournament.teams.pendientes[captainId]) return interaction.reply({ content: 'Error: Solicitud no encontrada o ya procesada.', flags: [MessageFlags.Ephemeral] });
        const teamData = tournament.teams.pendientes[captainId];
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $unset: { [`teams.pendientes.${captainId}`]: "" } });
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`❌ 🇪🇸 Tu inscripción para el equipo **${teamData.nombre}** en el torneo **${tournament.nombre}** ha sido **rechazada**.\n🇬🇧 Your registration for the team **${teamData.nombre}** in the **${tournament.nombre}** tournament has been **rejected**.`);
        } catch (e) { console.warn(`No se pudo enviar MD de rechazo al usuario ${captainId}`); }
        const originalMessage = interaction.message;
        const originalEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
        originalEmbed.setFooter({ text: `Rechazado por ${interaction.user.tag}`}).setColor('#e74c3c');
        await originalMessage.edit({ embeds: [originalEmbed], components: [] });
        await interaction.reply({ content: `❌ Equipo rechazado y capitán notificado.`, flags: [MessageFlags.Ephemeral] });
        return;
    }
    if (action === 'admin_approve_kick') {
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        
        await kickTeam(client, tournament, captainId);
        
        try {
            const user = await client.users.fetch(captainId);
            await user.send(`✅ Tu solicitud de expulsión del torneo **${tournament.nombre}** ha sido **aprobada** por un administrador.`);
        } catch(e) {}
        
        await interaction.message.edit({ content: `✅ Solicitud de expulsión de <@${captainId}> **aprobada** por <@${interaction.user.id}>.`, embeds:[], components: [] });
        await interaction.editReply({ content: 'Expulsión aprobada.'});
        return;
    }
    if (action === 'admin_reject_kick') {
        const [tournamentShortId, captainId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });
        
         try {
            const user = await client.users.fetch(captainId);
            await user.send(`❌ Tu solicitud de expulsión del torneo **${tournament.nombre}** ha sido **rechazada** por un administrador.`);
        } catch(e) {}
        
        await interaction.message.edit({ content: `❌ Solicitud de expulsión de <@${captainId}> **rechazada** por <@${interaction.user.id}>.`, embeds: [], components: [] });
        await interaction.editReply({ content: 'Expulsión rechazada.'});
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
}
