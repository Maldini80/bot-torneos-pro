// index.js (Versión Limpia para Background Worker)
import { Client, GatewayIntentBits, Events, MessageFlags, EmbedBuilder } from 'discord.js';
import 'dotenv/config';
import { connectDb, getDb } from './database.js';
import { handleCommand } from './src/handlers/commandHandler.js';
import { handleButton } from './src/handlers/buttonHandler.js';
import { handleModal } from './src/handlers/modalHandler.js';
import { handleSelectMenu } from './src/handlers/selectMenuHandler.js';
import { handleMessageTranslation } from './src/logic/translationLogic.js';
import { updateTournamentChannelName, updateAdminPanel, updateAllManagementPanels } from './src/utils/panelManager.js';
// --- INICIO DE LA MODIFICACIÓN ---
// Se importa la configuración de canales para usarla en el nuevo listener
import { CHANNELS } from './config.js';
// --- FIN DE LA MODIFICACIÓN ---

process.on('uncaughtException', (error, origin) => {
    console.error('💥 ERROR FATAL NO CAPTURADO:');
    console.error(error);
    console.error('💥 ORIGEN DEL ERROR:');
    console.error(origin);
});

export let isBotBusy = false;
export async function setBotBusy(status) { 
    isBotBusy = status;
    await updateAdminPanel(client);
    await updateAllManagementPanels(client, status);
}

const client = new Client({
    intents: [ 
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMessageReactions 
    ]
});

client.once(Events.ClientReady, async readyClient => {
    try {
        console.log(`✅ Bot conectado como ${readyClient.user.tag}`);
        
        // CORRECCIÓN DEFINITIVA: Se implementa una carga más robusta y con verificación.
        const guild = readyClient.guilds.cache.get(process.env.GUILD_ID);
        if (guild) {
            console.log('[CACHE] Forzando la carga de la lista de miembros del servidor...');
            // Usamos fetch({}) para asegurar que traiga a todos los miembros.
            const members = await guild.members.fetch({});
            // AÑADIDO: Log de verificación para que puedas ver cuántos miembros se cargaron.
            console.log(`[CACHE] Carga completa. ${members.size} miembros están ahora en la caché.`);
        } else {
            console.error(`[CRASH EN READY] No se pudo encontrar el servidor con ID: ${process.env.GUILD_ID}. Verifica las variables de entorno.`);
        }

        await updateTournamentChannelName(readyClient);
    } catch (error) {
        console.error('[CRASH EN READY] Ocurrió un error crítico durante la inicialización:', error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (isBotBusy && interaction.isButton() && !interaction.customId.startsWith('admin_force_reset_bot')) {
        try {
            await interaction.reply({ content: '⏳ El bot está realizando una operación crítica. Por favor, espera un momento.', flags: [MessageFlags.Ephemeral] });
        } catch (e) {
            if (e.code !== 40060) console.error("Error al notificar 'bot ocupado':", e);
        }
        return;
    }
    
    try {
        if (interaction.isChatInputCommand()) await handleCommand(interaction);
        else if (interaction.isButton()) await handleButton(interaction);
        else if (interaction.isModalSubmit()) await handleModal(interaction);
        else if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) await handleSelectMenu(interaction);
    } catch (error) {
        if (error.code === 10062) {
            console.warn('[WARN] Se intentó responder a una interacción que ya había expirado.');
            return;
        }
        
        console.error('[ERROR DE INTERACCIÓN]', error);
        
        try {
            const errorMessage = { content: '❌ Hubo un error al procesar tu solicitud.', flags: [MessageFlags.Ephemeral] };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (e) {
            if (e.code !== 10062 && e.code !== 40060) {
                 console.error("Error al enviar mensaje de error de interacción:", e.message);
            }
        }
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;
    await handleMessageTranslation(message);

    try {
        const channel = message.channel;
        if (!channel.isThread() || message.author.bot) return;

        const threadName = channel.name;
        const isMatchThread = threadName.startsWith('⚔️-') || threadName.startsWith('⚠️-') || threadName.startsWith('🧪-');

        if (isMatchThread) {
            const knownVideoDomains = ['streamable.com', 'youtube.com', 'youtu.be', 'twitch.tv'];
            const linkInMessage = knownVideoDomains.some(domain => message.content.includes(domain));
            
            if (linkInMessage) {
                const urlMatch = message.content.match(/https?:\/\/[^\s]+/);
                if (!urlMatch) return;
                const url = urlMatch[0];

                const uploader = message.author;
                const cleanTitle = threadName.replace(/^[⚔️⚠️🧪]-/g, '').replace(/-/g, ' ');

                const embed = new EmbedBuilder()
                    .setTitle(`Prueba del partido: ${cleanTitle}`)
                    .setURL(url)
                    .setAuthor({ name: `Prueba subida por ${uploader.username}`, iconURL: uploader.displayAvatarURL() })
                    .setDescription(`[Click aquí para ver la prueba](${url})`)
                    .setColor('#3498db')
                    .setTimestamp();

                await channel.send({ embeds: [embed] });
                await message.delete();
            }
        }
    } catch (error) {
        console.error("Error en el detector de enlaces de pruebas:", error);
    }
});

// --- INICIO DE LA MODIFICACIÓN ---
// NUEVO LISTENER: Se activa cada vez que un mensaje es borrado.
client.on(Events.MessageDelete, async message => {
    // El objeto 'message' puede ser parcial. Usamos message.channelId que es más fiable.
    // Si el mensaje borrado no es del canal de estado de torneos, no hacemos nada.
    if (message.channelId !== CHANNELS.TORNEOS_STATUS) return;

    // Si el mensaje borrado no era del bot, no nos interesa.
    // Usamos ?. por si el mensaje es muy antiguo y no está en la caché.
    if (message.author?.id !== client.user.id) return;
    
    // Si el mensaje borrado era un panel de torneo en el canal correcto,
    // forzamos una actualización del nombre del canal.
    console.log(`[SYNC] Panel de torneo borrado en el canal de estado. Forzando actualización de icono.`);
    updateTournamentChannelName(client);
});
// --- FIN DE LA MODIFICACIÓN ---

async function startBot() {
    await connectDb();
    client.login(process.env.DISCORD_TOKEN);
}

startBot();
