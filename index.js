// index.js
import { Client, GatewayIntentBits, Events } from 'discord.js';
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
export function setBotBusy(status) {
    isBotBusy = status;
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
    console.log(`✅ Bot conectado como ${readyClient.user.tag}`);
    await updateTournamentChannelName(readyClient);
});
client.on(Events.InteractionCreate, async interaction => {
    if (isBotBusy && interaction.isButton() && !interaction.customId.startsWith('admin_force_reset_bot')) {
        return interaction.reply({ content: '⏳ El bot está realizando una operación crítica. Por favor, espera un momento.', ephemeral: true });
    }
    try {
        if (interaction.isChatInputCommand()) await handleCommand(interaction);
        else if (interaction.isButton()) await handleButton(interaction);
        else if (interaction.isModalSubmit()) await handleModal(interaction);
        else if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction);
    } catch (error) {
        console.error('[ERROR DE INTERACCIÓN]', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Hubo un error al procesar tu solicitud.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'Hubo un error al procesar tu solicitud.', ephemeral: true });
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
