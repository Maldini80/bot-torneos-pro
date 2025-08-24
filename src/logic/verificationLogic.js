// --- CONTENIDO COMPLETO PARA src/logic/verificationLogic.js ---
// (Crea este nuevo archivo en la carpeta src/logic/ y pega este código)

import { getDb } from '../../database.js';
import { ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } from 'discord.js';

const VERIFIED_ROLE_ID = 'TU_ROL_DE_VERIFICADO_ID'; // 👈 ¡IMPORTANTE! Reemplaza esto con el ID real de tu rol.
const ADMIN_APPROVAL_CHANNEL_ID = '1405086450583732245';

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
        const pcMenu = new StringSelectMenuBuilder()
            .setCustomId('verify_select_pc_launcher')
            .setPlaceholder('Selecciona tu lanzador de PC')
            .addOptions([
                { label: '🔵 Steam', value: 'steam' },
                { label: '🟠 EA App', value: 'ea_app' },
            ]);
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
            .setDescription("Para una verificación automática, necesitamos que vincules tu cuenta a tu perfil de Discord. Es un proceso seguro gestionado por Discord.\n\n**Pasos a seguir:**\n1. Abre Discord y ve a `Ajustes de Usuario` > `Conexiones`.\n2. Haz clic en el icono de PlayStation o Xbox y sigue las instrucciones.\n3. **¡MUY IMPORTANTE!** Asegúrate de que la opción **`Mostrar en el perfil`** esté **activada**.\n\nUna vez que lo hayas hecho, pulsa el botón de abajo.")
        const continueButton = new ButtonBuilder()
            .setCustomId(`verify_show_modal:${platform}`)
            .setLabel('✅ Mi cuenta está vinculada y visible')
            .setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(continueButton);
        await interaction.update({
            content: "### Asistente de Verificación - Paso 2 de 3",
            embeds: [guideEmbed],
            components: [row]
        });
    }
}

export async function handlePCLauncherSelection(interaction) {
    const launcher = interaction.values[0];
    if (launcher === 'steam') {
        const guideEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`Guía para Vincular tu Cuenta de Steam`)
            .setDescription("La verificación con Steam es automática. Solo necesitamos que vincules tu cuenta a Discord.\n\n**Pasos a seguir:**\n1. En Discord, ve a `Ajustes de Usuario` > `Conexiones`.\n2. Haz clic en el icono de Steam y sigue las instrucciones.\n3. Asegúrate de que la opción **`Mostrar en el perfil`** esté **activada**.\n\nCuando estés listo, pulsa el botón de abajo.")
        const continueButton = new ButtonBuilder()
            .setCustomId(`verify_show_modal:steam`)
            .setLabel('✅ Mi cuenta de Steam está vinculada')
            .setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(continueButton);
        await interaction.update({ content: "### Asistente de Verificación - Paso 2 de 3 (Steam)", embeds: [guideEmbed], components: [row] });
    } else { // EA App
        const guideEmbed = new EmbedBuilder()
            .setColor('#f0ad4e')
            .setTitle(`Guía para la Verificación Manual (EA App)`)
            .setDescription("Como Discord no se conecta a la EA App, la verificación será **manual**.\n\n**Guía para la Prueba:**\nNecesitarás enviar una **captura de pantalla** a un administrador. La captura debe mostrar **dos ventanas a la vez**:\n1. La **EA App** abierta en tu perfil, donde se vea claramente tu **EA ID**.\n2. La aplicación de **Discord** abierta en tu perfil de usuario.\n\nPrepara la captura y pulsa el botón de abajo para introducir tus datos.")
        const continueButton = new ButtonBuilder()
            .setCustomId(`verify_show_modal:ea_app`)
            .setLabel('✅ Entendido, estoy listo')
            .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(continueButton);
        await interaction.update({ content: "### Asistente de Verificación - Paso 2 de 3 (EA App)", embeds: [guideEmbed], components: [row] });
    }
}

// ... (El resto de las funciones para este archivo irán aquí)
