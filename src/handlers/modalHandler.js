// src/handlers/modalHandler.js
import { getDb } from '../../database.js';
import { createNewTournament, updateTournamentConfig, updatePublicMessages, forceResetAllTournaments, addTeamToWaitlist } from '../logic/tournamentLogic.js';
import { processMatchResult, findMatch, finalizeMatchThread } from '../logic/matchLogic.js';
import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } from 'discord.js';
import { CHANNELS, ARBITRO_ROLE_ID, PAYMENT_CONFIG } from '../../config.js';
import { updateTournamentManagementThread, updateTournamentChannelName } from '../utils/panelManager.js';

export async function handleModal(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();
    const [action, ...params] = customId.split(':');

    if (action === 'admin_force_reset_modal') {
        const confirmation = interaction.fields.getTextInputValue('confirmation_text');
        if (confirmation !== 'CONFIRMAR RESET') {
            return interaction.reply({ content: '❌ El texto de confirmación no coincide. El reseteo ha sido cancelado.', flags: [MessageFlags.Ephemeral] });
        }
        await interaction.reply({ content: '⏳ **CONFIRMADO.** Iniciando reseteo forzoso...', flags: [MessageFlags.Ephemeral] });
        try {
            await forceResetAllTournaments(client);
            await interaction.followUp({ content: '✅ **RESETEO COMPLETO.**', flags: [MessageFlags.Ephemeral] });
        } catch (error) {
            console.error("Error crítico durante el reseteo forzoso:", error);
            await interaction.followUp({ content: '❌ Ocurrió un error crítico durante el reseteo. Revisa los logs.', flags: [MessageFlags.Ephemeral] });
        }
        return;
    }
    if (action === 'create_tournament') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [formatId, type] = params;
        const nombre = interaction.fields.getTextInputValue('torneo_nombre');
        const shortId = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const config = { formatId, isPaid: type === 'pago' };
        config.startTime = interaction.fields.getTextInputValue('torneo_start_time') || null;
        if (config.isPaid) {
            config.entryFee = parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee'));
            config.enlacePaypal = PAYMENT_CONFIG.PAYPAL_EMAIL;
            config.prizeCampeon = parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon'));
            config.prizeFinalista = parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista') || '0');
        }
        try {
            await createNewTournament(client, guild, nombre, shortId, config);
            await interaction.editReply({ content: `✅ ¡Éxito! El torneo **"${nombre}"** ha sido creado.` });
        } catch (error) {
            console.error("Error capturado por el handler al crear el torneo:", error);
            await interaction.editReply({ content: `❌ Ocurrió un error al crear el torneo. Revisa los logs.` });
        }
        return;
    }
    if (action === 'edit_tournament_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const newConfig = {
            prizeCampeon: parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon')),
            prizeFinalista: parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista')),
            entryFee: parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee')),
            startTime: interaction.fields.getTextInputValue('torneo_start_time') || null,
        };
        newConfig.isPaid = newConfig.entryFee > 0;
        try {
            await updateTournamentConfig(client, tournamentShortId, newConfig);
            await interaction.editReply({ content: '✅ ¡Éxito! La configuración ha sido actualizada. Usa el botón "Notificar Cambios" para avisar a los capitanes.' });
        } catch (error) {
            console.error("Error al actualizar la configuración del torneo:", error);
            await interaction.editReply({ content: `❌ Ocurrió un error al actualizar el torneo. Revisa los logs.` });
        }
        return;
    }
    if (action === 'edit_payment_details_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const newConfig = {
            isPaid: true,
            entryFee: parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee')),
            prizeCampeon: parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon')),
            prizeFinalista: parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista')),
        };
        await updateTournamentConfig(client, tournamentShortId, newConfig);
        await interaction.editReply({ content: `✅ Torneo actualizado a: **De Pago**.`, components: [] });
        return;
    }
    if (action === 'inscripcion_modal' || action === 'reserva_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

        if (!tournament || tournament.status !== 'inscripcion_abierta') {
            return interaction.editReply('Las inscripciones para este torneo no están abiertas.');
        }

        const captainId = interaction.user.id;
        const isAlreadyInTournament = tournament.teams.aprobados[captainId] || tournament.teams.pendientes[captainId] || (tournament.teams.reserva && tournament.teams.reserva[captainId]);
        if (isAlreadyInTournament) {
            return interaction.editReply({ content: '❌ 🇪🇸 Ya estás inscrito o en la lista de reserva de este torneo.\n🇬🇧 You are already registered or on the waitlist for this tournament.'});
        }
        
        const teamName = interaction.fields.getTextInputValue('nombre_equipo_input');
        const eafcTeamName = interaction.fields.getTextInputValue('eafc_team_name_input');
        const allTeamNames = [
            ...Object.values(tournament.teams.aprobados || {}).map(e => e.nombre.toLowerCase()),
            ...Object.values(tournament.teams.pendientes || {}).map(e => e.nombre.toLowerCase()),
            ...Object.values(tournament.teams.reserva || {}).map(e => e.nombre.toLowerCase())
        ];

        if (allTeamNames.includes(teamName.toLowerCase())) {
            return interaction.editReply('Ya existe un equipo con este nombre en este torneo.');
        }
        
        const teamData = { id: captainId, nombre: teamName, eafcTeamName, capitanId: captainId, capitanTag: interaction.user.tag, coCaptainId: null, coCaptainTag: null, bandera: '🏳️', paypal: null, inscritoEn: new Date() };

        if (action === 'reserva_modal') {
            await addTeamToWaitlist(client, tournament, teamData);
            await interaction.editReply('✅ 🇪🇸 ¡Inscripción recibida! Has sido añadido a la **lista de reserva**. Serás notificado si una plaza queda libre.\n🇬🇧 Registration received! You have been added to the **waitlist**. You will be notified if a spot becomes available.');
            return;
        }

        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { [`teams.pendientes.${captainId}`]: teamData } });
        
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (!notificationsThread) {
            return interaction.editReply('Error interno: No se pudo encontrar el canal de notificaciones.');
        }

        if (tournament.config.isPaid) {
            const embedDm = new EmbedBuilder().setTitle(`💸 Inscripción Pendiente de Pago: ${tournament.nombre}`).setDescription(`🇪🇸 ¡Casi listo! Para confirmar tu plaza, realiza el pago.\n🇬🇧 Almost there! To confirm your spot, please complete the payment.`).addFields({ name: 'Entry', value: `${tournament.config.entryFee}€` }, { name: 'Pagar a / Pay to', value: `\`${tournament.config.enlacePaypal}\`` }, { name: 'Instrucciones / Instructions', value: '🇪🇸 1. Realiza el pago.\n2. Pulsa el botón de abajo para confirmar.\n\n🇬🇧 1. Make the payment.\n2. Press the button below to confirm.' }).setColor('#e67e22');
            const confirmButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`payment_confirm_start:${tournament.shortId}`).setLabel('✅ He Pagado / I Have Paid').setStyle(ButtonStyle.Success));
            try {
                await interaction.user.send({ embeds: [embedDm], components: [confirmButton] });
                await interaction.editReply({ content: '✅ 🇪🇸 ¡Inscripción recibida! Revisa tus MD para completar el pago.\n🇬🇧 Registration received! Check your DMs to complete the payment.' });
            } catch (e) {
                await interaction.editReply({ content: '❌ 🇪🇸 No he podido enviarte un MD. Por favor, abre tus MDs y vuelve a intentarlo.\n🇬🇧 I could not send you a DM. Please open your DMs and try again.' });
            }
        } else {
            const adminEmbed = new EmbedBuilder().setColor('#3498DB').setTitle(`🔔 Nueva Inscripción Gratuita`).addFields( { name: 'Equipo Torneo', value: teamName, inline: true }, { name: 'Capitán', value: interaction.user.tag, inline: true }, { name: 'Equipo EAFC', value: eafcTeamName, inline: false } );
            const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_approve:${interaction.user.id}:${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin_reject:${interaction.user.id}:${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
            await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });
            await interaction.editReply('✅ 🇪🇸 ¡Tu inscripción ha sido recibida! Un admin la revisará pronto.\n🇬🇧 Your registration has been received! An admin will review it shortly.');
        }
        return;
    }

    if (action === 'payment_confirm_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('❌ Este torneo ya no existe.');
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (!notificationsThread) return interaction.editReply('Error interno: No se pudo encontrar el canal de notificaciones.');
        const userPaypal = interaction.fields.getTextInputValue('user_paypal_input');
        await db.collection('tournaments').updateOne({ shortId: tournamentShortId }, { $set: { [`teams.pendientes.${interaction.user.id}.paypal`]: userPaypal } });
        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const teamData = updatedTournament.teams.pendientes[interaction.user.id];
        if (!teamData) return interaction.editReply('❌ No se encontró tu inscripción pendiente. Por favor, inscríbete de nuevo.');
        const adminEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle(`💰 Notificación de Pago`).addFields( { name: 'Equipo', value: teamData.nombre, inline: true }, { name: 'Capitán', value: teamData.capitanTag, inline: true }, { name: "PayPal del Capitán", value: `\`${userPaypal}\`` } );
        const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_approve:${interaction.user.id}:${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin_reject:${interaction.user.id}:${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });
        await interaction.editReply('✅ 🇪🇸 ¡Gracias! Tu pago ha sido notificado. Recibirás un aviso cuando sea aprobado.\n🇬🇧 Thank you! Your payment has been notified. You will receive a notice upon approval.');
        return;
    }
    if (action === 'add_test_teams_modal') {
        await interaction.reply({ content: '✅ Orden recibida. Añadiendo equipos de prueba en segundo plano...', flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const amount = parseInt(interaction.fields.getTextInputValue('amount_input'));
        if (isNaN(amount) || amount <= 0) return;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return;
        const teamsCount = Object.keys(tournament.teams.aprobados).length;
        const availableSlots = tournament.config.format.size - teamsCount;
        const amountToAdd = Math.min(amount, availableSlots);
        if (amountToAdd <= 0) return;
        let bulkOps = [];
        for (let i = 0; i < amountToAdd; i++) {
            const teamId = `test_${Date.now()}_${i}`;
            const teamData = { id: teamId, nombre: `E-Prueba-${teamsCount + i + 1}`, eafcTeamName: `EAFC-Test-${teamsCount + i + 1}`, capitanId: interaction.user.id, capitanTag: interaction.user.tag, bandera: '🧪', paypal: 'admin@test.com', inscritoEn: new Date() };
            bulkOps.push({ updateOne: { filter: { _id: tournament._id }, update: { $set: { [`teams.aprobados.${teamId}`]: teamData } } } });
        }
        if (bulkOps.length > 0) await db.collection('tournaments').bulkWrite(bulkOps);
        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        await updatePublicMessages(client, updatedTournament);
        await updateTournamentManagementThread(client, updatedTournament);
        // CORRECCIÓN DE RENDIMIENTO
        updateTournamentChannelName(client);
        return;
    }
    if (action === 'report_result_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [matchId, tournamentShortId] = params;
        let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const { partido } = findMatch(tournament, matchId);
        if (!partido) return interaction.editReply('Error: Partido no encontrado.');
        const golesA = interaction.fields.getTextInputValue('goles_a');
        const golesB = interaction.fields.getTextInputValue('goles_b');
        if (isNaN(parseInt(golesA)) || isNaN(parseInt(golesB))) return interaction.editReply('Error: Los goles deben ser números.');
        const reportedResult = `${golesA}-${golesB}`;
        const reporterId = interaction.user.id;
        const opponentId = reporterId === partido.equipoA.capitanId ? partido.equipoB.capitanId : partido.equipoA.capitanId;
        partido.reportedScores[reporterId] = reportedResult;
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { "structure": tournament.structure } });
        const opponentReport = partido.reportedScores[opponentId];
        if (opponentReport) {
            if (opponentReport === reportedResult) {
                tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
                const processedMatch = await processMatchResult(client, guild, tournament, matchId, reportedResult);
                await interaction.editReply({content: '✅ 🇪🇸 Resultados coinciden. El partido ha sido finalizado.\n🇬🇧 Results match. The match has been finalized.'});
                await finalizeMatchThread(client, processedMatch, reportedResult);
            } else {
                await interaction.editReply({content: '❌ 🇪🇸 Los resultados reportados no coinciden. Se ha notificado a los árbitros.\n🇬🇧 The reported results do not match. Referees have been notified.'});
                const thread = interaction.channel;
                if(thread.isThread()) await thread.setName(`⚠️${thread.name.replace(/^[⚔️✅🔵]-/g, '')}`.slice(0,100));
                await interaction.channel.send({ content: `🚨 <@&${ARBITRO_ROLE_ID}> ¡Resultados no coinciden para el partido **${partido.equipoA.nombre} vs ${partido.equipoB.nombre}**!\n- <@${reporterId}> reportó: \`${reportedResult}\`\n- <@${opponentId}> reportó: \`${opponentReport}\`` });
            }
        } else {
            await interaction.editReply({content: '✅ 🇪🇸 Tu resultado ha sido enviado. Esperando el reporte de tu oponente.\n🇬🇧 Your result has been submitted. Awaiting your opponent\'s report.'});
            await interaction.channel.send(`ℹ️ <@${reporterId}> ha reportado un resultado de **${reportedResult}**. Esperando la confirmación de <@${opponentId}>.`);
        }
        return;
    }
    if (action === 'admin_force_result_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [matchId, tournamentShortId] = params;
        let tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');
        const golesA = interaction.fields.getTextInputValue('goles_a');
        const golesB = interaction.fields.getTextInputValue('goles_b');
        if (isNaN(parseInt(golesA)) || isNaN(parseInt(golesB))) return interaction.editReply('Error: Los goles deben ser números.');
        const resultString = `${golesA}-${golesB}`;
        
        const processedMatch = await processMatchResult(client, guild, tournament, matchId, resultString);
        await interaction.editReply(`✅ Resultado forzado a **${resultString}** por un administrador.`);
        await finalizeMatchThread(client, processedMatch, resultString);

        return;
    }
    if (action === 'invite_cocaptain_modal') {
        // Esta sección ya no se usa, pero la dejamos por si acaso. La lógica ahora está en el selectMenuHandler.
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [tournamentShortId] = params;
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply({ content: 'Error: Torneo no encontrado.' });

        const captainId = interaction.user.id;
        const team = tournament.teams.aprobados[captainId];
        if (!team) return interaction.editReply({ content: 'Error: No eres el capitán de un equipo en este torneo.' });
        if (team.coCaptainId) return interaction.editReply({ content: 'Ya tienes un co-capitán.'});
        
        const coCaptainId = interaction.fields.getTextInputValue('cocaptain_id_input').trim();
        
        if (!/^\d+$/.test(coCaptainId)) {
            return interaction.editReply({ 
                content: '❌ **Error:** El valor introducido no es una ID de Discord válida. Por favor, introduce únicamente la ID numérica del usuario (ej: 1398287366929776670).',
                flags: [MessageFlags.Ephemeral]
            });
        }
        
        const allCaptainsAndCoCaptains = Object.values(tournament.teams.aprobados).flatMap(t => [t.capitanId, t.coCaptainId]).filter(Boolean);
        if (allCaptainsAndCoCaptains.includes(coCaptainId)) {
            return interaction.editReply({ content: '❌ Esta persona ya participa en el torneo como capitán o co-capitán.' });
        }

        try {
            const coCaptainUser = await client.users.fetch(coCaptainId);
            if (coCaptainUser.bot) return interaction.editReply({ content: 'No puedes invitar a un bot.' });
            
            await db.collection('tournaments').updateOne(
                { _id: tournament._id },
                { $set: { [`teams.coCapitanes.${captainId}`]: { inviterId: captainId, invitedId: coCaptainId, invitedAt: new Date() } } }
            );

            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`🤝 Invitación de Co-Capitán / Co-Captain Invitation`)
                .setDescription(`🇪🇸 Has sido invitado por **${interaction.user.tag}** para ser co-capitán de su equipo **${team.nombre}** en el torneo **${tournament.nombre}**.\n\n` +
                              `🇬🇧 You have been invited by **${interaction.user.tag}** to be the co-captain of their team **${team.nombre}** in the **${tournament.nombre}** tournament.`);
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`cocaptain_accept:${tournament.shortId}:${captainId}:${coCaptainId}`).setLabel('Aceptar / Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`cocaptain_reject:${tournament.shortId}:${captainId}:${coCaptainId}`).setLabel('Rechazar / Reject').setStyle(ButtonStyle.Danger)
            );

            await coCaptainUser.send({ embeds: [embed], components: [row] });
            // CORRECCIÓN: Se usa followUp en lugar de editReply para evitar el falso error de MD bloqueado.
            await interaction.followUp({ content: `✅ Invitación enviada a **${coCaptainUser.tag}**. Recibirá un MD para aceptar o rechazar.`, flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            console.error(error);
            if (error.code === 10013) {
                await interaction.editReply('❌ No se pudo encontrar a ese usuario. Asegúrate de que la ID es correcta.');
            } else {
                 await interaction.editReply('❌ No se pudo enviar el MD de invitación. Es posible que el usuario tenga los mensajes directos bloqueados.');
            }
        }
    }
}
