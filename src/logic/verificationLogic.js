// --- CONTENIDO COMPLETO PARA src/logic/verificationLogic.js ---

import { getDb } from '../../database.js';
import { ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } from 'discord.js';
import { VERIFIED_ROLE_ID, ADMIN_APPROVAL_CHANNEL_ID } from '../../config.js';

// --- FUNCIONES DE VERIFICACIÓN ---

export async function checkVerification(userId) {
    const db = getDb();
    const verification = await db.collection('verified_users').findOne({ discordId: userId });
    return verification;
}

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

export async function handlePlatformSelection(interaction) {
    const platform = interaction.values[0];
    if (platform === 'pc') {
        const pcMenu = new StringSelectMenuBuilder().setCustomId('verify_select_pc_launcher').setPlaceholder('Selecciona tu lanzador de PC').addOptions([{ label: '🔵 Steam', value: 'steam' }, { label: '🟠 EA App', value: 'ea_app' }]);
        const row = new ActionRowBuilder().addComponents(pcMenu);
        await interaction.update({ content: "### Asistente de Verificación - Paso 1.5 de 3 (PC)\nEntendido, juegas en PC. ¿A través de qué plataforma principal?", components: [row] });
    } else {
        const platformName = platform === 'psn' ? 'PlayStation' : 'Xbox';
        const guideEmbed = new EmbedBuilder().setColor('#5865F2').setTitle(`Guía para Vincular tu Cuenta de ${platformName}`).setDescription("Para una verificación automática, necesitamos que vincules tu cuenta a tu perfil de Discord. Es un proceso seguro gestionado por Discord.\n\n**Pasos a seguir:**\n1. Abre Discord y ve a `Ajustes de Usuario` > `Conexiones`.\n2. Haz clic en el icono de PlayStation o Xbox y sigue las instrucciones.\n3. **¡MUY IMPORTANTE!** Asegúrate de que la opción **`Mostrar en el perfil`** esté **activada**.\n\nUna vez que lo hayas hecho, pulsa el botón de abajo.");
        const continueButton = new ButtonBuilder().setCustomId(`verify_show_modal:${platform}`).setLabel('✅ Mi cuenta está vinculada y visible').setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(continueButton);
        await interaction.update({ content: "### Asistente de Verificación - Paso 2 de 3", embeds: [guideEmbed], components: [row] });
    }
}

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

export async function showVerificationModal(interaction, platform) {
    const platformNames = { psn: 'PSN ID', xbox: 'Xbox Gamertag', steam: 'Perfil de Steam', ea_app: 'EA ID' };
    const modal = new ModalBuilder().setCustomId(`verify_submit_data:${platform}`).setTitle('Verificación - Paso Final');
    const gameIdInput = new TextInputBuilder().setCustomId('game_id_input').setLabel(`Tu ${platformNames[platform]}`).setPlaceholder('Escríbelo exactamente como aparece en tu perfil').setStyle(TextInputStyle.Short).setRequired(true);
    const twitterInput = new TextInputBuilder().setCustomId('twitter_input').setLabel("Tu usuario de Twitter (sin @)").setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(gameIdInput), new ActionRowBuilder().addComponents(twitterInput));
    await interaction.showModal(modal);
}

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
        await adminChannel.send({ embeds: [embed] }); // Aquí los admins podrían tener un botón para aprobar/rechazar
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

// (Las funciones de actualización de perfil se omiten por ahora para simplificar, como acordamos)
