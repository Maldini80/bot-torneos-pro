// src/handlers/modalHandler.js
import { getDb } from '../../database.js';
import { createNewTournament, updatePublicMessages, updateTournamentConfig } from '../logic/tournamentLogic.js';
import { processMatchResult, findMatch } from '../logic/matchLogic.js';
import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CHANNELS } from '../../config.js';
import { updateTournamentManagementThread } from '../utils/panelManager.js';

export async function handleModal(interaction) {
    const customId = interaction.customId;
    const client = interaction.client;
    const guild = interaction.guild;
    const db = getDb();

    if (customId.startsWith('create_tournament:')) {
        await interaction.deferReply({ ephemeral: true });
        const [, formatId, type] = customId.split(':');
        const nombre = interaction.fields.getTextInputValue('torneo_nombre');
        const shortId = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const config = { formatId, isPaid: type === 'pago' };
        if (config.isPaid) {
            config.entryFee = parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee'));
            config.enlacePaypal = interaction.fields.getTextInputValue('torneo_paypal');
            config.prizeCampeon = parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon'));
            config.prizeFinalista = parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista') || '0');
        }
        try {
            await createNewTournament(client, guild, nombre, shortId, config);
            await interaction.editReply({ content: `✅ ¡Éxito! El torneo **"${nombre}"** ha sido creado. Se han generado los hilos de gestión y notificaciones en los canales de administración.` });
        } catch (error) {
            console.error("Error capturado por el handler al crear el torneo:", error);
            await interaction.editReply({ content: `❌ Ocurrió un error al crear el torneo. Revisa los logs.` });
        }
        return;
    }

    if (customId.startsWith('edit_tournament_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const tournamentShortId = customId.split('_').pop();
        
        const newConfig = {
            prizeCampeon: parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon')),
            prizeFinalista: parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista')),
            entryFee: parseFloat(interaction.fields.getTextInputValue('torneo_entry_fee')),
        };
        // Determinar si es de pago basándose en la cuota
        newConfig.isPaid = newConfig.entryFee > 0;

        try {
            await updateTournamentConfig(client, tournamentShortId, newConfig);
            await interaction.editReply({ content: '✅ ¡Éxito! La configuración del torneo ha sido actualizada. Se ha notificado a los capitanes inscritos (si los había).' });
        } catch (error) {
            console.error("Error al actualizar la configuración del torneo:", error);
            await interaction.editReply({ content: `❌ Ocurrió un error al actualizar el torneo. Revisa los logs.` });
        }
        return;
    }

    if (customId.startsWith('inscripcion_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const tournamentShortId = customId.split('_')[2];
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || tournament.status !== 'inscripcion_abierta') {
            return interaction.editReply('Las inscripciones para este torneo no están abiertas.');
        }

        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (!notificationsThread) {
            return interaction.editReply('Error interno: No se pudo encontrar el canal de notificaciones para este torneo. Contacta a un admin.');
        }

        const teamName = interaction.fields.getTextInputValue('nombre_equipo_input');
        const allTeamNames = [...Object.values(tournament.teams.aprobados || {}).map(e => e.nombre.toLowerCase()), ...Object.values(tournament.teams.pendientes || {}).map(e => e.nombre.toLowerCase())];
        if (allTeamNames.includes(teamName.toLowerCase())) {
            return interaction.editReply('Ya existe un equipo con este nombre en este torneo.');
        }
        const teamData = { id: interaction.user.id, nombre: teamName, capitanId: interaction.user.id, capitanTag: interaction.user.tag, bandera: '🏳️', paypal: null, inscritoEn: new Date() };
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { [`teams.pendientes.${interaction.user.id}`]: teamData } });
        
        if (tournament.config.isPaid) {
            const embedDm = new EmbedBuilder().setTitle(`💸 Inscripción Pendiente de Pago / Registration Pending Payment: ${tournament.nombre}`).setDescription(`🇪🇸 ¡Casi listo! Para confirmar tu plaza, por favor, realiza el pago.\n🇬🇧 Almost there! To confirm your spot, please complete the payment.`).addFields({ name: 'Precio / Entry Fee', value: `${tournament.config.entryFee}€` }, { name: 'Pagar a / Pay to', value: `\`${tournament.config.enlacePaypal}\`` }, { name: 'Instrucciones / Instructions', value: '🇪🇸 1. Realiza el pago.\n2. Pulsa el botón de abajo para confirmar.\n\n🇬🇧 1. Make the payment.\n2. Press the button below to confirm.' }).setColor('#e67e22');
            const confirmButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`payment_confirm_start_${tournament.shortId}`).setLabel('✅ He Pagado / I Have Paid').setStyle(ButtonStyle.Success));
            try {
                await interaction.user.send({ embeds: [embedDm], components: [confirmButton] });
                await interaction.editReply({ content: '✅ 🇪🇸 ¡Inscripción recibida! Revisa tus mensajes directos (MD) para completar el pago.\n🇬🇧 Registration received! Check your Direct Messages (DM) to complete the payment.' });
            } catch (e) {
                await interaction.editReply({ content: '❌ 🇪🇸 No he podido enviarte un MD. Por favor, asegúrate de que tus MD están abiertos y vuelve a intentarlo.\n🇬🇧 I could not send you a DM. Please make sure your DMs are open and try again.' });
            }
        } else {
            const adminEmbed = new EmbedBuilder().setColor('#3498DB').setTitle(`🔔 Nueva Inscripción Gratuita`).addFields({ name: 'Equipo / Team', value: teamName, inline: true }, { name: 'Capitán / Captain', value: interaction.user.tag, inline: true });
            const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_approve_${interaction.user.id}_${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin_reject_${interaction.user.id}_${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
            await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });
            await interaction.editReply('✅ 🇪🇸 ¡Tu inscripción ha sido recibida! Un administrador la revisará pronto.\n🇬🇧 Your registration has been received! An admin will review it shortly.');
        }
        return;
    }

    if (customId.startsWith('payment_confirm_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const tournamentShortId = customId.split('_')[3];
        
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) {
            return interaction.editReply('❌ Este torneo ya no existe o ha finalizado.');
        }
        
        const notificationsThread = await client.channels.fetch(tournament.discordMessageIds.notificationsThreadId).catch(() => null);
        if (!notificationsThread) {
            return interaction.editReply('Error interno: No se pudo encontrar el canal de notificaciones. Contacta a un admin.');
        }

        const userPaypal = interaction.fields.getTextInputValue('user_paypal_input');
        await db.collection('tournaments').updateOne({ shortId: tournamentShortId }, { $set: { [`teams.pendientes.${interaction.user.id}.paypal`]: userPaypal } });
        
        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        const teamData = updatedTournament.teams.pendientes[interaction.user.id];
        if (!teamData) {
             return interaction.editReply('❌ No se encontró tu inscripción pendiente. Por favor, inscríbete de nuevo.');
        }

        const adminEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle(`💰 Notificación de Pago`).addFields({ name: 'Equipo / Team', value: teamData.nombre, inline: true }, { name: 'Capitán / Captain', value: teamData.capitanTag, inline: true }, { name: 'PayPal del Capitán / Captain\'s PayPal', value: `\`${userPaypal}\`` });
        const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_approve_${interaction.user.id}_${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin_reject_${interaction.user.id}_${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        await notificationsThread.send({ embeds: [adminEmbed], components: [adminButtons] });
        await interaction.editReply('✅ 🇪🇸 ¡Gracias! Tu pago ha sido notificado. Recibirás un aviso cuando sea aprobado.\n🇬🇧 Thank you! Your payment has been notified. You will receive a notice upon approval.');
        return;
    }
    
    if (customId.startsWith('add_test_teams_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const tournamentShortId = customId.split('_')[4];
        const amount = parseInt(interaction.fields.getTextInputValue('amount_input'));
        if (isNaN(amount) || amount <= 0) return interaction.editReply('Cantidad inválida.');
        
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament) return interaction.editReply('Error: Torneo no encontrado.');
        
        const teamsCount = Object.keys(tournament.teams.aprobados).length;
        const availableSlots = tournament.config.format.size - teamsCount;
        const amountToAdd = Math.min(amount, availableSlots);

        if (amountToAdd <= 0) {
            return interaction.editReply('No hay plazas disponibles en el torneo para añadir equipos.');
        }

        let bulkOps = [];
        for (let i = 0; i < amountToAdd; i++) {
            const teamId = `test_${Date.now()}_${i}`;
            const teamData = { 
                id: teamId, 
                nombre: `E-Prueba-${teamsCount + i + 1}`, 
                capitanId: interaction.user.id, // El admin es el capitán
                capitanTag: interaction.user.tag, 
                bandera: '🧪', 
                paypal: 'admin@test.com', // PayPal ficticio
                inscritoEn: new Date() 
            };
            bulkOps.push({
                updateOne: {
                    filter: { _id: tournament._id },
                    update: { $set: { [`teams.aprobados.${teamId}`]: teamData } }
                }
            });
        }
        
        if (bulkOps.length > 0) {
            await db.collection('tournaments').bulkWrite(bulkOps);
        }
        
        const updatedTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        await updatePublicMessages(client, updatedTournament);
        await updateTournamentManagementThread(client, updatedTournament);
        await interaction.editReply(`✅ Se han añadido ${amountToAdd} equipos de prueba.`);
        return;
    }
}
