// --- INICIO DEL ARCHIVO verificationLogic.js (VERSIÓN FINAL Y COMPLETA) ---

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
            .addOptions([ { label: '🔵 Steam', value: 'steam' }, { label: '🟠 EA App', value: 'ea_app' } ]);
        const row = new ActionRowBuilder().addComponents(pcMenu);
        await interaction.update({
            content: "### Asistente de Verificación - Paso 1.5 de 3 (PC)\nEntendido, juegas en PC. ¿A través de qué plataforma principal?",
            components: [row]
        });
    } else {
        const platformName = platform === 'psn' ? 'PlayStation' : 'Xbox';
        const guideEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`Guía para Vincular tu Cuenta de ${platformName}`)
            .setDescription("Para una verificación automática, necesitamos que vincules tu cuenta a tu perfil de Discord. Es un proceso seguro gestionado por Discord.\n\n**Pasos a seguir:**\n1. Abre Discord y ve a `Ajustes de Usuario` > `Conexiones`.\n2. Haz clic en el icono de PlayStation o Xbox y sigue las instrucciones.\n3. **¡MUY IMPORTANTE!** Asegúrate de que la opción **`Mostrar en el perfil`** esté **activada**.\n\nUna vez que lo hayas hecho, pulsa el botón de abajo.");
        const continueButton = new ButtonBuilder()
            .setCustomId(`verify_show_modal:${platform}`)
            .setLabel('✅ Mi cuenta está vinculada y visible')
            .setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(continueButton);
        await interaction.update({ content: "### Asistente de Verificación - Paso 2 de 3", embeds: [guideEmbed], components: [row] });
    }
}

/**
 * Maneja la selección de lanzador de PC (Steam o EA App).
 */
export async function handlePCLauncherSelection(interaction) {
    const launcher = interaction.values[0];
    const guideEmbed = new EmbedBuilder();
    const continueButton = new ButtonBuilder().setCustomId(`verify_show_modal:${launcher}`);
    if (launcher === 'steam') {
        guideEmbed.setColor('#5865F2').setTitle(`Guía para Vincular tu Cuenta de Steam`).setDescription("La verificación con Steam es automática. Solo necesitamos que vincules tu cuenta a Discord.\n\n**Pasos a seguir:**\n1. En Discord, ve a `Ajustes de Usuario` > `Conexiones`.\n2. Haz clic en el icono de Steam y sigue las instrucciones.\n3. Asegúrate de que la opción **`Mostrar en el perfil`** esté **activada**.\n\nCuando estés listo, pulsa el botón de abajo.");
        continueButton.setLabel('✅ Mi cuenta de Steam está vinculada').setStyle(ButtonStyle.Success);
    } else { // EA App
        guideEmbed.setColor('#f0ad4e').setTitle(`Guía para la Verificación Manual (EA App)`).setDescription("Como Discord no se conecta a la EA App, la verificación será **manual**.\n\n**Guía para la Prueba:**\nNecesitarás enviar una **captura de pantalla** a un administrador. La captura debe mostrar **dos ventanas a la vez**:\n1. La **EA App** abierta en tu perfil, donde se vea claramente tu **EA ID**.\n2. La aplicación de **Discord** abierta en tu perfil de usuario.\n\nPrepara la captura y pulsa el botón de abajo para introducir tus datos.");
        continueButton.setLabel('✅ Entendido, estoy listo').setStyle(ButtonStyle.Primary);
    }
    const row = new ActionRowBuilder().addComponents(continueButton);
    await interaction.update({ content: `### Asistente de Verificación - Paso 2 de 3 (${launcher.toUpperCase()})`, embeds: [guideEmbed], components: [row] });
}

/**
 * Muestra el formulario final para introducir el ID de Juego y Twitter.
 */
export async function showVerificationModal(interaction, platform) {
    const platformNames = { psn: 'PSN ID', xbox: 'Xbox Gamertag', steam: 'Perfil de Steam', ea_app: 'EA ID' };
    const modal = new ModalBuilder().setCustomId(`verify_submit_data:${platform}`).setTitle('Verificación - Paso Final');
    const gameIdInput = new TextInputBuilder().setCustomId('game_id_input').setLabel(`Tu ${platformNames[platform]}`).setPlaceholder('Escríbelo exactamente como aparece en tu perfil').setStyle(TextInputStyle.Short).setRequired(true);
    const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu usuario de Twitter (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(gameIdInput), new ActionRowBuilder().addComponents(twitterInput));
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
    const user = interaction.user;
    const member = interaction.member;

    const existingVerification = await db.collection('verified_users').findOne({ $or: [{ discordId: user.id }, { gameId: { $regex: new RegExp(`^${gameId}$`, 'i') } }] });
    if (existingVerification) {
        return interaction.editReply('❌ **Error:** Tu cuenta de Discord o este ID de Juego ya han sido verificados previamente.');
    }

    if (platform === 'ea_app') {
        const adminChannel = await interaction.guild.channels.fetch(ADMIN_APPROVAL_CHANNEL_ID);
        const embed = new EmbedBuilder().setColor('#f0ad4e').setTitle('🔎 Solicitud de Verificación Manual (EA App)').setDescription(`**Usuario:** <@${user.id}> (${user.tag})\n**EA ID:** \`${gameId}\`\n**Twitter:** \`${twitter}\``).setFooter({ text: 'Esperando captura de pantalla y aprobación de un admin.' });
        // Aquí podrías añadir botones para que los admins aprueben directamente
        await adminChannel.send({ embeds: [embed] });
        return interaction.editReply('👍 **¡Solicitud Recibida!** Tu inscripción está **pendiente de verificación manual**. Por favor, contacta a un administrador y envíale tu captura de pantalla para completar el proceso.');
    }
    
    try {
        await member.user.fetch(true);
        const connections = member.user.connections;
        if (!connections || connections.size === 0) {
            return interaction.editReply('❌ **Error:** No hemos encontrado ninguna conexión en tu perfil de Discord. Asegúrate de vincular tu cuenta y hacerla visible.');
        }

        const platformTypeMap = { psn: 'playstation', xbox: 'xbox', steam: 'steam' };
        const relevantConnection = connections.find(conn => conn.type === platformTypeMap[platform]);

        if (!relevantConnection) {
            return interaction.editReply(`❌ **Error:** No hemos encontrado una conexión de **${platform}** en tu perfil. Asegúrate de haberla vinculado correctamente.`);
        }

        const idFromProfile = relevantConnection.name;
        
        if (idFromProfile.toLowerCase() !== gameId.toLowerCase()) {
            return interaction.editReply(`❌ **Error de Verificación: El ID no coincide.**\nEl ID que has introducido (\`${gameId}\`) no coincide con el que tienes conectado en tu perfil (\`${idFromProfile}\`).`);
        }
        
        await db.collection('verified_users').insertOne({ discordId: user.id, discordTag: user.tag, gameId: idFromProfile, platform: platform, twitter: twitter, verifiedAt: new Date() });
        const verifiedRole = await interaction.guild.roles.fetch(VERIFIED_ROLE_ID);
        if (verifiedRole) await member.roles.add(verifiedRole);
        await interaction.editReply('🎉 **¡Identidad Verificada con Éxito!** 🎉\nTu cuenta ha sido vinculada. Ya puedes inscribirte en nuestros drafts.');
    } catch (error) {
        console.error("Error durante la verificación automática:", error);
        await interaction.editReply('❌ Hubo un error al leer las conexiones de tu perfil. Asegúrate de que tu perfil de Discord no sea privado y vuelve a intentarlo. Si el problema persiste, contacta a un administrador.');
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
        ]);
    const row = new ActionRowBuilder().addComponents(fieldMenu);
    await interaction.editReply({ content: "### Asistente de Actualización de Perfil - Paso 1\n¿Qué dato verificado deseas solicitar cambiar?", components: [row] });
}

export async function handleProfileUpdateSelection(interaction) {
    const fieldToUpdate = interaction.values[0];
    const verificationData = await checkVerification(interaction.user.id);
    const currentValue = verificationData[fieldToUpdate];

    const modal = new ModalBuilder()
        .setCustomId(`update_profile_submit_new_value:${fieldToUpdate}`)
        .setTitle(`Actualizar ${fieldToUpdate === 'gameId' ? 'ID de Juego' : 'Twitter'}`);
        
    const newValueInput = new TextInputBuilder()
        .setCustomId('new_value_input')
        .setLabel("Nuevo Valor")
        .setPlaceholder("Escribe aquí el nuevo dato")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const reasonInput = new TextInputBuilder()
        .setCustomId('reason_input')
        .setLabel("Motivo del Cambio")
        .setPlaceholder("Ej: Me equivoqué al escribirlo, he cambiado de cuenta, etc.")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
        
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
    await db.collection('verified_users').updateOne({ discordId: userId }, { $set: { [field]: newValue } });
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (user) await user.send(`✅ Un administrador ha **aprobado** tu solicitud para cambiar tu \`${field}\`. Tu nuevo valor es ahora \`${newValue}\`.`);
    
    const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor('#2ecc71').setFooter({ text: `Aprobado por ${interaction.user.tag}` });
    await interaction.message.edit({ embeds: [embed], components: [] });
    if (field === 'gameId') {
    const activeDrafts = await db.collection('drafts').find({ 
        status: { $in: ['inscripcion', 'seleccion'] }, 
        'players.userId': userId 
    }).toArray();

    for (const draft of activeDrafts) {
        await db.collection('drafts').updateOne(
            { _id: draft._id, 'players.userId': userId },
            { $set: { 'players.$.psnId': newValue } }
        );
        await db.collection('drafts').updateOne(
            { _id: draft._id, 'captains.userId': userId },
            { $set: { 'captains.$.psnId': newValue } }
        );
        const updatedDraft = await db.collection('drafts').findOne({ _id: draft._id });
        if (updatedDraft) {
            await updateDraftMainInterface(interaction.client, updatedDraft.shortId);
            await notifyVisualizer(updatedDraft);
        }
    }
}
    await interaction.reply({ content: 'Cambio aprobado.', ephemeral: true });
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
