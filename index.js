// index.js (Archivo Raíz)
import { Client, GatewayIntentBits } from 'discord.js';
import { connectDb } from './database.js';
import { handleCommand } from './src/handlers/commandHandler.js';
import { handleButton } from './src/handlers/buttonHandler.js';
import { handleModal } from './src/handlers/modalHandler.js';
import { handleSelectMenu } from './src/handlers/selectMenuHandler.js';
import { handleMessageTranslation } from './src/logic/translationLogic.js';
import { updateAdminPanel, updateAllManagementPanels } from './src/utils/panelManager.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
    ]
});

let busy = false;
export const isBotBusy = busy;
export async function setBotBusy(state) {
    busy = state;
    await updateAdminPanel(client);
    await updateAllManagementPanels(client, state);
}

client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    try {
        const guildId = process.env.GUILD_ID;
        if (!guildId) {
            console.error("[CACHE] ERROR: La variable de entorno GUILD_ID no está configurada.");
            return;
        }
        console.log('[CACHE] Forzando la carga de la lista de miembros del servidor...');
        const guild = await client.guilds.fetch(guildId);
        await guild.members.fetch();
        console.log(`[CACHE] Carga completa. ${guild.members.cache.size} miembros están ahora en la caché.`);
    } catch (e) {
        console.error("[CACHE] No se pudo forzar la carga de miembros:", e.message);
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButton(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModal(interaction);
        } else if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
            await handleSelectMenu(interaction);
        }
    } catch (error) {
        console.error('[INTERACTION ERROR]', error);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: '❌ Hubo un error al procesar tu solicitud.', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ Hubo un error al procesar tu solicitud.', ephemeral: true });
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    await handleMessageTranslation(message);
});

async function start() {
    await connectDb();
    // Usamos la variable de entorno directamente, que es la forma correcta
    await client.login(process.env.DISCORD_TOKEN);
}

start();
