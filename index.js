// index.js (Versión Limpia para Background Worker)
import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import 'dotenv/config';
// ELIMINADO: import { keepAlive } from './keep_alive.js';
import { connectDb, getDb } from './database.js';
import { handleCommand } from './src/handlers/commandHandler.js';
import { handleButton } from './src/handlers/buttonHandler.js';
import { handleModal } from './src/handlers/modalHandler.js';
import { handleSelectMenu } from './src/handlers/selectMenuHandler.js';
import { handleMessageTranslation } from './src/logic/translationLogic.js';
import { updateTournamentChannelName, updateAdminPanel, updateAllManagementPanels } from './src/utils/panelManager.js';

// Este bloque de diagnóstico es útil, lo dejamos por seguridad.
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

// Este bloque de diagnóstico es útil, lo dejamos por seguridad.
client.once(Events.ClientReady, async readyClient => {
    try {
        console.log(`✅ Bot conectado como ${readyClient.user.tag}`);
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
        else if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction);
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
});

async function startBot() {
    await connectDb();
    // ELIMINADO: keepAlive();
    client.login(process.env.DISCORD_TOKEN);
}

startBot();
