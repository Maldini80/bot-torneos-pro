// src/handlers/modalHandler.js
import { getDb } from '../../database.js';
import { createNewTournament } from '../logic/tournamentLogic.js';
import { updateAdminPanel, updateTournamentChannelName } from '../utils/panelManager.js';
import { setBotBusy } from '../../index.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function handleModal(interaction) {
    const [action, ...params] = interaction.customId.split('_');
    const client = interaction.client;
    const guild = interaction.guild;

    await interaction.deferReply({ ephemeral: true });

    if (action === 'create' && params[0] === 'tournament' && params[1] === 'final') {
        setBotBusy(true);
        await updateAdminPanel(client);
        await interaction.editReply({ content: '⏳ El bot está ocupado creando el torneo. El panel ha sido bloqueado...', ephemeral: true });
        
        const formatId = params[2], type = params[3];
        const nombre = interaction.fields.getTextInputValue('torneo_nombre');
        const shortId = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const config = { formatId, isPaid: type === 'pago' };
        if (config.isPaid) {
            config.enlacePaypal = interaction.fields.getTextInputValue('torneo_paypal');
            config.prizeCampeon = parseFloat(interaction.fields.getTextInputValue('torneo_prize_campeon'));
            config.prizeFinalista = parseFloat(interaction.fields.getTextInputValue('torneo_prize_finalista') || '0');
        }

        try {
            await createNewTournament(client, guild, nombre, shortId, config);
            await interaction.followUp({ content: `✅ ¡Torneo **${nombre}** creado exitosamente!`, ephemeral: true });
        } catch (error) {
            console.error('Error al crear el torneo:', error);
            await interaction.followUp({ content: '❌ Hubo un error crítico al crear el torneo.', ephemeral: true });
        } finally {
            setBotBusy(false);
            await updateAdminPanel(client);
            await updateTournamentChannelName(client);
        }
    }

    if (action === 'inscripcion' && params[0] === 'modal') {
        const tournamentShortId = params[1], db = getDb();
        const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
        if (!tournament || tournament.status !== 'inscripcion_abierta') return interaction.editReply('Las inscripciones para este torneo no están abiertas.');
        
        const teamName = interaction.fields.getTextInputValue('nombre_equipo_input');
        const allTeamNames = [...Object.values(tournament.teams.aprobados || {}).map(e => e.nombre.toLowerCase()), ...Object.values(tournament.teams.pendientes || {}).map(e => e.nombre.toLowerCase())];
        if (allTeamNames.includes(teamName.toLowerCase())) return interaction.editReply('Ya existe un equipo con este nombre en este torneo.');

        const teamData = { nombre: teamName, capitanId: interaction.user.id, capitanTag: interaction.user.tag, bandera: '🏳️', paypal: null, inscritoEn: new Date() };
        await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { [`teams.pendientes.${interaction.user.id}`]: teamData } });
        
        const adminChannel = await client.channels.fetch(tournament.discordMessageIds.matchThreadsParentId);
        const adminEmbed = new EmbedBuilder().setColor('#3498DB').setTitle(`🔔 Nueva Inscripción Pendiente: ${tournament.nombre}`).addFields({ name: 'Equipo', value: teamName, inline: true }, { name: 'Capitán', value: interaction.user.tag, inline: true });
        const adminButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_approve_${interaction.user.id}_${tournament.shortId}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`admin_reject_${interaction.user.id}_${tournament.shortId}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );
        await adminChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
        await interaction.editReply('✅ ¡Tu inscripción ha sido recibida! Un administrador la revisará pronto.');
    }
}
