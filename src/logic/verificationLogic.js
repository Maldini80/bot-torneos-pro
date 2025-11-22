// --- INICIO DEL ARCHIVO verificationLogic.js (VERSIÓN FINAL Y COMPLETA) ---

import { notifyVisualizer, updateDraftMainInterface } from '../logic/tournamentLogic.js';
import { getDb } from '../../database.js';
import { ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, MessageFlags } from 'discord.js';
import { VERIFIED_ROLE_ID, ADMIN_APPROVAL_CHANNEL_ID } from '../../config.js';

// =======================================================
// --- SISTEMA DE VERIFICACIÓN DE CUENTA ---
// =======================================================

/**
 * Comprueba si un usuario ya está verificado en la base de datos.
 */
export async function checkVerification(userId) {
    const db = getDb();
    return await db.collection('verified_users').findOne({ discordId: userId });
}

/**
 * Inicia el asistente de verificación para un usuario.
 */
export async function startVerificationWizard(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const platformMenu = new StringSelectMenuBuilder()
        .setCustomId('verify_select_platform')
        .setPlaceholder('Selecciona tu plataforma principal')
        .addOptions([
            { label: '🎮 PlayStation', value: 'psn' },
            { label: '🟩 Xbox', value: 'xbox' },
            { label: '💻 PC', value: 'pc' },
        ]);
    const row = new ActionRowBuilder().addComponents(platformMenu);
    await interaction.editReply({
        content: "### Asistente de Verificación - Paso 1 de 3\n¡Hola! Para participar, primero debes verificar tu cuenta de juego. Por favor, dinos desde qué plataforma juegas.",
        components: [row]
    });
}

/**
 * Maneja la selección de plataforma del usuario (Consola o PC).
 */
export async function handlePlatformSelection(interaction) {
    const platform = interaction.values[0];
    if (platform === 'pc') {
        const pcMenu = new StringSelectMenuBuilder()
            .setCustomId('verify_select_pc_launcher')
            .setPlaceholder('Selecciona tu lanzador de PC')
            .addOptions([{ label: '🔵 Steam', value: 'steam' }, { label: '🟠 EA App', value: 'ea_app' }]);
        const row = new ActionRowBuilder().addComponents(pcMenu);
        await interaction.update({
            content: "### Asistente de Verificación - Paso 1.5 de 3 (PC)\nEntendido, juegas en PC. ¿A través de qué plataforma principal?",
            components: [row]
        });
    } else {
        const platformName = platform === 'psn' ? 'PlayStation' : 'Xbox';
        const continueButton = new ButtonBuilder()
            .setCustomId(`verify_show_modal:${platform}`)
            .setLabel('✅ Continuar')
            .setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(continueButton);
        await interaction.update({ content: `### Asistente de Verificación - Paso 2 de 3\nHas seleccionado **${platformName}**. Pulsa el botón para introducir tus datos.`, components: [row], embeds: [] });
    }
}

/**
 * Maneja la selección de lanzador de PC (Steam o EA App).
 */
export async function handlePCLauncherSelection(interaction) {
    const launcher = interaction.values[0];
    const continueButton = new ButtonBuilder().setCustomId(`verify_show_modal:${launcher}`).setLabel('✅ Continuar').setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(continueButton);
    await interaction.update({ content: `### Asistente de Verificación - Paso 2 de 3 (${launcher.toUpperCase()})\nPulsa el botón para introducir tus datos.`, embeds: [], components: [row] });
}

/**
 * Muestra el formulario final para introducir el ID de Juego y Twitter.
 */
export async function showVerificationModal(interaction, platform) {
    const platformNames = { psn: 'PSN ID', xbox: 'Xbox Gamertag', steam: 'Perfil de Steam', ea_app: 'EA ID' };
    const modal = new ModalBuilder().setCustomId(`verify_submit_data:${platform}`).setTitle('Verificación - Paso Final');
    const gameIdInput = new TextInputBuilder().setCustomId('game_id_input').setLabel(`Tu ${platformNames[platform]}`).setPlaceholder('Escríbelo exactamente como aparece en tu perfil').setStyle(TextInputStyle.Short).setRequired(true);
    const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu usuario de Twitter (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
    const whatsappInput = new TextInputBuilder().setCustomId('whatsapp_input').setLabel("Tu número de WhatsApp").setPlaceholder("Incluye el prefijo (ej: +34...)").setStyle(TextInputStyle.Short).setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(gameIdInput), new ActionRowBuilder().addComponents(twitterInput), new ActionRowBuilder().addComponents(whatsappInput));
    await interaction.showModal(modal);
}

/**
 * Procesa los datos del formulario, realiza la verificación automática o la envía a la cola manual.
 */
export async function processVerification(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const db = getDb();
    const [platform] = interaction.customId.split(':');
    const gameId = interaction.fields.getTextInputValue('game_id_input').trim();
    const twitter = interaction.fields.getTextInputValue('twitter_input').trim();
    const whatsapp = interaction.fields.getTextInputValue('whatsapp_input').trim();
    const user = interaction.user;
    const member = interaction.member;

    const existingVerification = await db.collection('verified_users').findOne({ $or: [{ discordId: user.id }, { gameId: { $regex: new RegExp(`^${gameId}$`, 'i') } }] });
    if (existingVerification) {
        return interaction.editReply('❌ **Error:** Tu cuenta de Discord o este ID de Juego ya han sido verificados previamente.');
    }

    try {
        await db.collection('verified_users').insertOne({
            discordId: user.id,
            discordTag: user.tag,
            gameId: gameId,
            platform: platform,
            twitter: twitter,
            whatsapp: whatsapp,
            verifiedAt: new Date()
        });

        const verifiedRole = await interaction.guild.roles.fetch(VERIFIED_ROLE_ID);
        if (verifiedRole) await member.roles.add(verifiedRole);

        await interaction.editReply('🎉 **¡Identidad Verificada con Éxito!** 🎉\nTus datos han sido registrados y ya puedes inscribirte en nuestros drafts.');
    } catch (error) {
        console.error("Error durante la verificación simplificada:", error);
        await interaction.editReply('❌ Hubo un error al guardar tus datos. Por favor, inténtalo de nuevo.');
    }
}

// =======================================================
// --- SISTEMA DE ACTUALIZACIÓN DE PERFIL ---
// =======================================================

export async function startProfileUpdateWizard(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const fieldMenu = new StringSelectMenuBuilder()
        .setCustomId('update_profile_select_field')
        .setPlaceholder('Selecciona el dato que quieres cambiar')
        .addOptions([
            { label: '🆔 ID de Juego (PSN/Xbox/EA)', value: 'gameId' },
            { label: '🐦 Cuenta de Twitter', value: 'twitter' },
            { label: '📞 Número de WhatsApp', value: 'whatsapp' },
        ]);
    const row = new ActionRowBuilder().addComponents(fieldMenu);
    await interaction.editReply({ content: "### Asistente de Actualización de Perfil - Paso 1\n¿Qué dato verificado deseas solicitar cambiar?", components: [row] });
}

export async function handleProfileUpdateSelection(interaction) {
    const fieldToUpdate = interaction.values[0];
    const verificationData = await checkVerification(interaction.user.id);
    const currentValue = verificationData[fieldToUpdate];

    // --- TÍTULO DINÁMICO ---
    const fieldLabels = { gameId: 'ID de Juego', twitter: 'Twitter', whatsapp: 'WhatsApp' };
    const modalTitle = `Actualizar ${fieldLabels[fieldToUpdate] || fieldToUpdate}`;

    const modal = new ModalBuilder()
        .setCustomId(`update_profile_submit_new_value:${fieldToUpdate}`)
        .setTitle(modalTitle); // <-- USAMOS EL TÍTULO CORRECTO

    const newValueInput = new TextInputBuilder().setCustomId('new_value_input').setLabel("Nuevo Valor").setPlaceholder("Escribe aquí el nuevo dato").setStyle(TextInputStyle.Short).setRequired(true);
    const reasonInput = new TextInputBuilder().setCustomId('reason_input').setLabel("Motivo del Cambio").setPlaceholder("Ej: Me equivoqué al escribirlo, he cambiado de cuenta, etc.").setStyle(TextInputStyle.Paragraph).setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(newValueInput), new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
}

export async function processProfileUpdate(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const [fieldToUpdate] = interaction.customId.split(':');
    const newValue = interaction.fields.getTextInputValue('new_value_input');
    const reason = interaction.fields.getTextInputValue('reason_input');
    const verificationData = await checkVerification(interaction.user.id);

    const adminChannel = await interaction.guild.channels.fetch(ADMIN_APPROVAL_CHANNEL_ID);
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🔄 Solicitud de Actualización de Perfil')
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .addFields(
            { name: 'Usuario', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Dato a Cambiar', value: `\`${fieldToUpdate}\``, inline: true },
            { name: 'Valor Antiguo', value: `\`${verificationData[fieldToUpdate]}\``, inline: false },
            { name: 'Nuevo Valor', value: `\`${newValue}\``, inline: false },
            { name: 'Motivo', value: reason }
        );

    const needsProof = fieldToUpdate === 'gameId';
    if (needsProof) {
        embed.setFooter({ text: 'Este cambio requiere pruebas. Abrir un hilo para que el usuario las aporte.' });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_approve_update:${interaction.user.id}:${fieldToUpdate}:${newValue}`).setLabel('Aceptar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`admin_reject_update:${interaction.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`admin_open_thread:${interaction.user.id}`).setLabel('Abrir Hilo').setStyle(ButtonStyle.Secondary).setEmoji('💬')
    );

    await adminChannel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ Tu solicitud de cambio ha sido enviada a los administradores para su revisión.' });
}

export async function approveProfileUpdate(interaction) {
    const [, userId, field, newValue] = interaction.customId.split(':');
    const db = getDb();

    // Actualiza el perfil verificado principal (Lógica existente)
    await db.collection('verified_users').updateOne({ discordId: userId }, { $set: { [field]: newValue } });

    // --- INICIO DE LA NUEVA LÓGICA DE SINCRONIZACIÓN ---

    // 1. Buscamos todos los drafts activos donde el jugador esté inscrito.
    const activeDrafts = await db.collection('drafts').find({
        "players.userId": userId,
        status: { $nin: ['finalizado', 'torneo_generado', 'cancelado'] }
    }).toArray();

    if (activeDrafts.length > 0) {
        // 2. Mapeamos los nombres de los campos para que coincidan con la estructura de 'players' en el draft.
        const fieldMap = {
            gameId: 'psnId',
            twitter: 'twitter',
            whatsapp: 'whatsapp'
        };
        const draftField = fieldMap[field];

        if (draftField) {
            // 3. Actualizamos el dato en todos los drafts activos donde esté el jugador.
            await db.collection('drafts').updateMany(
                { "players.userId": userId, status: { $nin: ['finalizado', 'torneo_generado', 'cancelado'] } },
                { $set: { [`players.$.${draftField}`]: newValue } }
            );

            // 4. Notificamos las interfaces y el visualizador de cada draft afectado.
            for (const draft of activeDrafts) {
                const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
                await updateDraftMainInterface(interaction.client, updatedDraft.shortId);
                await notifyVisualizer(updatedDraft); // ¡Importante para la web!
            }
        }
    }
    // --- FIN DE LA NUEVA LÓGICA DE SINCRONIZACIÓN ---

    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (user) await user.send(`✅ Un administrador ha **aprobado** tu solicitud para cambiar tu \`${field}\`. Tu nuevo valor es ahora \`${newValue}\`.`);

    const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor('#2ecc71').setFooter({ text: `Aprobado por ${interaction.user.tag}` });
    await interaction.message.edit({ embeds: [embed], components: [] });
    // Mensaje de respuesta mejorado para el admin
    await interaction.reply({ content: 'Cambio aprobado y sincronizado con los drafts activos.', ephemeral: true });
}

export async function rejectProfileUpdate(interaction) {
    const [, userId] = interaction.customId.split(':');
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (user) await user.send(`❌ Un administrador ha **rechazado** tu solicitud de cambio de perfil.`);

    const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor('#e74c3c').setFooter({ text: `Rechazado por ${interaction.user.tag}` });
    await interaction.message.edit({ embeds: [embed], components: [] });
    await interaction.reply({ content: 'Cambio rechazado.', ephemeral: true });
}

export async function openProfileUpdateThread(interaction) {
    // --- INICIO DE LA CORRECCIÓN ---
    // Se reemplaza la creación de hilos por la creación de canales privados
    // para evitar el error de permisos 'Missing Access'.

    const VERIFICATION_TICKET_CATEGORY_ID = '1396814712649551974'; // ID de la categoría de tickets
    const [, userId] = interaction.customId.split(':');
    const user = await interaction.guild.members.fetch(userId);

    try {
        // Crear un canal de texto privado para el usuario y los administradores
        const channel = await interaction.guild.channels.create({
            name: `update-${user.user.username}`,
            type: ChannelType.GuildText,
            parent: VERIFICATION_TICKET_CATEGORY_ID,
            permissionOverwrites: [
                {
                    id: interaction.guild.id, // @everyone
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: userId, // El usuario que solicita el cambio
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles],
                },
                // Los roles de administrador/árbitro heredarán los permisos de la categoría
            ],
            reason: `Canal para la actualización de perfil de ${user.user.tag}`
        });

        // Enviar instrucciones al nuevo canal
        await channel.send(`Hola <@${userId}>, un administrador ha abierto este canal para discutir tu solicitud de cambio de perfil. Si se te han solicitado pruebas (como una captura de pantalla), por favor, súbelas aquí.`);

        const finalActionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(interaction.message.components[0].components[0].data.custom_id).setLabel('Aprobar (en canal)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(interaction.message.components[0].components[1].data.custom_id).setLabel('Rechazar (en canal)').setStyle(ButtonStyle.Danger)
        );
        await channel.send({ content: "Acciones para administradores:", components: [finalActionRow] });

        // Actualizar el mensaje original en el canal de admins con un enlace al nuevo canal
        const goToChannelButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ir al Canal de Discusión').setStyle(ButtonStyle.Link).setURL(channel.url));
        await interaction.message.edit({ components: [goToChannelButton] });

        // Responder al admin que hizo clic
        await interaction.reply({ content: `Canal privado creado: ${channel.toString()}`, flags: [MessageFlags.Ephemeral] });

    } catch (error) {
        console.error("Error al crear el canal de actualización de perfil:", error);
        await interaction.reply({ content: '❌ Hubo un error al crear el canal. Revisa los permisos de la categoría de tickets.', flags: [MessageFlags.Ephemeral] });
    }
    // --- FIN DE LA CORRECCIÓN ---
}
