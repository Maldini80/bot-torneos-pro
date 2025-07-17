// index.js
import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import 'dotenv/config';
import { keepAlive } from './keep_alive.js';
import { connectDb } from './database.js';
import { handleCommand } from './src/handlers/commandHandler.js';
import { handleButton } from './src/handlers/buttonHandler.js';
import { handleModal } from './src/handlers/modalHandler.js';
import { handleSelectMenu } from './src/handlers/selectMenuHandler.js';
import { handleMessageTranslation } from './src/logic/translationLogic.js';
import { updateTournamentChannelName } from './src/utils/panelManager.js';

export let isBotBusy = false;
export function setBotBusy(status) { isBotBusy = status; }

const client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions ]
});

client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ Bot conectado como ${readyClient.user.tag}`);
    await updateTournamentChannelName(readyClient);
});

client.on(Events.InteractionCreate, async interaction => {
    if (isBotBusy && interaction.isButton() && !interaction.customId.startsWith('admin_force_reset_bot')) {
        return interaction.reply({ content: '⏳ El bot está realizando una operación crítica. Por favor, espera un momento.', flags: MessageFlags.Ephemeral });
    }
    try {
        if (interaction.isChatInputCommand()) await handleCommand(interaction);
        else if (interaction.isButton()) await handleButton(interaction);
        else if (interaction.isModalSubmit()) await handleModal(interaction);
        else if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction);
    } catch (error) {
        console.error('[ERROR DE INTERACCIÓN]', error);
        const errorMessage = { content: '❌ Hubo un error al procesar tu solicitud.', flags: MessageFlags.Ephemeral };
        try {
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
});

async function startBot() {
    await connectDb();
    keepAlive();
    client.login(process.env.DISCORD_TOKEN);
}

startBot();
