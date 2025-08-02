// index.js
import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import 'dotenv/config';
import { connectDb } from './database.js';
import { handleCommand } from './src/handlers/commandHandler.js';
import { handleButton } from './src/handlers/buttonHandler.js';
import { handleModal } from './src/handlers/modalHandler.js';
import { handleSelectMenu } from './src/handlers/selectMenuHandler.js';
import { handleMessageTranslation } from './src/logic/translationLogic.js';
import { updateAdminPanel, updateAllManagementPanels, updateAllDraftManagementPanels } from './src/utils/panelManager.js';
import { CHANNELS } from './config.js';

process.on('uncaughtException', (error, origin) => {
    console.error('💥 ERROR FATAL NO CAPTURADO:', { error, origin });
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 RECHAZO DE PROMESA NO MANEJADO:', { reason, promise });
});


export let isBotBusy = false;
export async function setBotBusy(status, client) {
    isBotBusy = status;
    await updateAdminPanel(client);
    await updateAllManagementPanels(client, status);
    await updateAllDraftManagementPanels(client, status);
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
        const guild = readyClient.guilds.cache.get(process.env.GUILD_ID);
        if (guild) {
            console.log('[CACHE] Forzando la carga de la lista de miembros del servidor...');
            await guild.members.fetch({});
            console.log(`[CACHE] Carga de miembros completa.`);
        } else {
            console.error(`[CRASH EN READY] No se pudo encontrar el servidor con ID: ${process.env.GUILD_ID}.`);
        }
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
            const errorMessage = { content: `❌ Hubo un error al procesar tu solicitud: ${error.message}`, flags: [MessageFlags.Ephemeral] };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (e) {
             console.error("Error al enviar mensaje de error de interacción:", e.message);
        }
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;
    await handleMessageTranslation(message);
    // Logic for video link detection remains the same...
});

client.on(Events.MessageDelete, async message => {
    // Logic for channel status sync remains the same...
});

async function startBot() {
    await connectDb();
    await client.login(process.env.DISCORD_TOKEN);
}

startBot();
