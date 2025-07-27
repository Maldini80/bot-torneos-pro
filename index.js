// index.js (Archivo Raíz)
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { TOKEN } from './config.js';
import { connectDb, getDb } from './database.js';
import { handleCommand } from './src/handlers/commandHandler.js';
import { handleButton } from './src/handlers/buttonHandler.js';
import { handleModal } from './src/handlers/modalHandler.js';
import { handleSelectMenu } from './src/handlers/selectMenuHandler.js';
import { handleMessageTranslation } from './src/logic/translationLogic.js';
// --- INICIO DE LA CORRECCIÓN ---
// Se elimina la importación de la función que ya no existe para prevenir el error de arranque.
import { updateAdminPanel, updateAllManagementPanels } from './src/utils/panelManager.js';
// --- FIN DE LA CORRECCIÓN ---

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
        console.log('[CACHE] Forzando la carga de la lista de miembros del servidor...');
        await client.guilds.cache.get('YOUR_GUILD_ID').members.fetch(); // Reemplaza YOUR_GUILD_ID con la ID de tu servidor
        console.log(`[CACHE] Carga completa. ${client.guilds.cache.get('YOUR_GUILD_ID').members.cache.size} miembros están ahora en la caché.`);
    } catch (e) {
        console.error("[CACHE] No se pudo forzar la carga de miembros:", e.message);
    }
    // --- INICIO DE LA CORRECCIÓN ---
    // Se elimina la llamada a la función que ya no existe.
    // updateTournamentChannelName(client); 
    // --- FIN DE LA CORRECCIÓN ---
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
    await client.login(TOKEN);
}

start();
