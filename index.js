// index.js - VERSIÓN FINAL PARA RENDER
require('dotenv').config();

// ===== PASO 1: INICIAR EL SERVIDOR WEB =====
// Esto es lo PRIMERO que hacemos para que Render detecte el puerto y no cancele el proceso.
const keepAlive = require('./keep_alive.js');
keepAlive();
// ============================================


// ===== PASO 2: CARGAR TODAS LAS DEPENDENCIAS Y CONFIGURACIÓN DEL BOT =====
console.log("[BOT] Cargando dependencias de Discord...");
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType, StringSelectMenuBuilder } = require('discord.js');
const { translate } = require('@vitalets/google-translate-api');

// --- "BASE DE DATOS" EN MEMORIA ---
let torneoActivo = null;
let mensajeInscripcionId = null;
let listaEquiposMessageId = null;

// --- CONFIGURACIÓN ---
const ADMIN_CHANNEL_ID = '1393187598796587028';
const CATEGORY_ID = '1393225162584883280';
const ARBITRO_ROLE_ID = '1393505777443930183';
const INSCRIPCION_CHANNEL_ID = '1393942335645286412';
const SETUP_COMMAND = '!setup-idiomas';

// --- DATOS DE IDIOMAS Y NORMAS ---
const languageRoles = {
    '🇪🇸': { name: 'Español', code: 'es' }, '🇮🇹': { name: 'Italiano', code: 'it' }, '🇬🇧': { name: 'English', code: 'en' },
    '🇫🇷': { name: 'Français', code: 'fr' }, '🇵🇹': { name: 'Português', code: 'pt' }, '🇩🇪': { name: 'Deutsch', code: 'de' },
    '🇹🇷': { name: 'Türkçe', code: 'tr' }
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// --- FUNCIONES AUXILIARES ---

async function limpiarCanal(channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.type === ChannelType.GuildText) {
            let fetched;
            do {
                fetched = await channel.messages.fetch({ limit: 100 });
                if (fetched.size > 0) {
                    await channel.bulkDelete(fetched, true);
                }
            } while (fetched.size >= 2);
        }
    } catch (err) {
        if (err.code !== 10003) { console.error(`Error al limpiar el canal ${channelId}:`, err); }
    }
}

async function crearCanalDePartido(guild, partido, tipoPartido = 'Grupo') {
    const safeTeamA = partido.equipoA.nombre.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 10);
    const safeTeamB = partido.equipoB.nombre.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 10);
    let baseChannelName;
    let description;
    if (tipoPartido.startsWith('Grupo')) {
        const groupLetter = partido.nombreGrupo.replace('Grupo ', '');
        baseChannelName = `g${groupLetter}-j${partido.jornada}-${safeTeamA}-vs-${safeTeamB}`.toLowerCase();
        description = `**${partido.nombreGrupo} - Jornada ${partido.jornada}**`;
    } else {
        baseChannelName = `knockout-${tipoPartido}-${safeTeamA}-vs-${safeTeamB}`.toLowerCase();
        description = `**Fase Eliminatoria - ${tipoPartido}** / **Knockout Stage - ${tipoPartido}**`;
    }
    const channelName = `⚔️-${baseChannelName}`;
    try {
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: partido.equipoA.capitanId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: partido.equipoB.capitanId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: ARBITRO_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ],
        });
        partido.channelId = channel.id;
        const embed = new EmbedBuilder().setColor('#3498db').setTitle(`Partido: ${partido.equipoA.nombre} vs ${partido.equipoB.nombre}`).setDescription(`${description}\n\n🇪🇸 Usad este canal para coordinar y jugar vuestro partido. Cuando terminéis, usad los botones de abajo.\n\n🇬🇧 *Use this channel to coordinate and play your match. When you finish, use the buttons below.*`);
        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`reportar_resultado_v3_${partido.matchId}`).setLabel("Reportar Resultado / Report Result").setStyle(ButtonStyle.Primary).setEmoji("📊"),
            new ButtonBuilder().setCustomId(`solicitar_arbitraje_${partido.matchId}`).setLabel("Solicitar Arbitraje / Request Referee").setStyle(ButtonStyle.Danger).setEmoji("⚠️")
        );
        await channel.send({ content: `<@${partido.equipoA.capitanId}> y <@${partido.equipoB.capitanId}>`, embeds: [embed], components: [actionButtons] });
        console.log(`[INFO] Canal de partido creado: ${channel.name}`);
    } catch (error) {
        console.error(`[ERROR FATAL] No se pudo crear el canal del partido.`, error);
        throw error;
    }
}

async function updateMatchChannelName(partido) {
    if (!partido.channelId) return;
    try {
        const channel = await client.channels.fetch(partido.channelId);
        if (!channel) return;
        const cleanBaseName = channel.name.replace(/^[⚔️✅⚠️]-/g, '').replace(/-\d+a\d+$/, '');
        let icon;
        if (partido.status === 'finalizado') icon = '✅';
        else if (partido.status === 'arbitraje') icon = '⚠️';
        else icon = '⚔️';
        let newName = `${icon}-${cleanBaseName}`;
        if (partido.status === 'finalizado' && partido.resultado) {
             const resultString = partido.resultado.replace('-', 'a');
             newName = `${newName}-${resultString}`;
        }
        await channel.setName(newName.slice(0, 100));
    } catch(err) {
        if (err.code !== 10003) { console.error(`Error al renombrar canal ${partido.channelId}:`, err); }
    }
}

async function mostrarMensajeEspera(interaction) {
    const channel = await client.channels.fetch(INSCRIPCION_CHANNEL_ID).catch(() => null);
    if (!channel) {
        console.log("No se encontró el canal de inscripciones.");
        if(interaction) await interaction.followUp({ content: 'Error: Canal de inscripción no encontrado.', ephemeral: true });
        return;
    }
    await limpiarCanal(INSCRIPCION_CHANNEL_ID);
    const waitEmbed = new EmbedBuilder().setColor('#34495e').setTitle('⏳ 🇪🇸 Torneo en Espera / 🇬🇧 Tournament on Standby').setDescription('🇪🇸 Actualmente no hay ningún torneo activo.\n\n🇬🇧 *There are currently no active tournaments.*');
    await channel.send({ embeds: [waitEmbed] });
}

client.once('ready', async () => {
    // Hemos movido el mensaje de "conectado" al final, en el bloque de login.
    // Esto es para asegurar que solo se muestra después de un inicio de sesión exitoso.
    if (!torneoActivo) {
        await mostrarMensajeEspera();
    }
});

client.on('guildMemberAdd', member => {
    const welcomeEmbed = new EmbedBuilder().setColor('#2ecc71').setTitle(`👋 ¡Bienvenido a ${member.guild.name}! / Welcome to ${member.guild.name}!`).setDescription('🇪🇸 Para continuar, por favor, selecciona tu idioma.\n\n🇬🇧 *To continue, please select your language.*');
    const row = new ActionRowBuilder();
    const flags = Object.keys(languageRoles);
    for (let i = 0; i < flags.length && i < 5; i++) {
        const flag = flags[i];
        row.addComponents(new ButtonBuilder().setCustomId(`rules_${languageRoles[flag].code}`).setLabel(languageRoles[flag].name).setEmoji(flag).setStyle(ButtonStyle.Secondary));
    }
    member.send({ embeds: [welcomeEmbed], components: [row] }).catch(() => console.log(`No se pudo enviar DM a ${member.user.tag}.`));
});

// --- MANEJADOR DE INTERACCIONES ---
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isCommand()) {
            // Este ejemplo no usa slash commands, pero lo dejamos por si lo añades en el futuro
            // await handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
            // await handleButton(interaction); // Aquí irían tus funciones de botones
        } else if (interaction.isStringSelectMenu()) {
            // await handleSelectMenu(interaction); // Aquí irían tus funciones de menús
        } else if (interaction.isModalSubmit()) {
            // await handleModalSubmit(interaction); // Aquí irían tus funciones de modales
        }
    } catch (error) {
        console.error('Ha ocurrido un error en el manejador de interacciones:', error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '🇪🇸 Hubo un error al procesar tu solicitud.\n🇬🇧 *An error occurred while processing your request.*', ephemeral: true });
            } else {
                await interaction.reply({ content: '🇪🇸 Hubo un error al procesar tu solicitud.\n🇬🇧 *An error occurred while processing your request.*', ephemeral: true });
            }
        } catch (e) {
            console.error('Error al enviar mensaje de error de interacción:', e);
        }
    }
});


// ===== PASO 3: INICIAR SESIÓN DEL BOT EN DISCORD =====
// Esto es lo ÚLTIMO que se ejecuta.
console.log("[BOT] Todas las funciones y eventos cargados.");
console.log("[BOT] Intentando iniciar sesión en Discord...");

client.login(process.env.DISCORD_TOKEN)
  .then(() => {
      console.log(`✅ [BOT] ¡Conexión exitosa! Logueado como ${client.user.tag}`);
  })
  .catch(error => {
      console.error("❌ [ERROR FATAL] No se pudo iniciar sesión en Discord.", error);
      // Si hay un error aquí, puede ser por un TOKEN inválido o problemas de red.
  });
