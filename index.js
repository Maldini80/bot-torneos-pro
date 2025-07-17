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
import { updateTournamentChannelName, updateAdminPanel } from './src/utils/panelManager.js';

// Variable global para controlar el estado del bot
export let isBotBusy = false;
export function setBotBusy(status) { 
    isBotBusy = status;
    // Cuando cambiamos el estado, es buena idea actualizar el panel de admin para que lo refleje.
    updateAdminPanel(client);
}

// Configuración del cliente de Discord con los intents necesarios
const client = new Client({
    intents: [ 
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMessageReactions 
    ]
});

// Evento que se ejecuta una sola vez cuando el bot se conecta exitosamente
client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ Bot conectado como ${readyClient.user.tag}`);
    // Al arrancar, actualizamos el nombre del canal de estado por si hay torneos activos.
    await updateTournamentChannelName(readyClient);
});

// Evento principal que maneja todas las interacciones (botones, comandos, menús, modales)
client.on(Events.InteractionCreate, async interaction => {
    // Si el bot está ocupado, responde inmediatamente y no procesa nada más.
    if (isBotBusy && interaction.isButton() && !interaction.customId.startsWith('admin_force_reset_bot')) {
        try {
            await interaction.reply({ content: '⏳ El bot está realizando una operación crítica. Por favor, espera un momento.', flags: [MessageFlags.Ephemeral] });
        } catch (e) {
            // Ignoramos el error si la interacción ya fue reconocida, lo cual puede pasar.
            if (e.code !== 40060) console.error("Error al notificar 'bot ocupado':", e);
        }
        return;
    }
    
    // Delegamos la interacción a su handler correspondiente
    try {
        if (interaction.isChatInputCommand()) await handleCommand(interaction);
        else if (interaction.isButton()) await handleButton(interaction);
        else if (interaction.isModalSubmit()) await handleModal(interaction);
        else if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction);
    } catch (error) {
        // Manejo de errores global para cualquier fallo durante el procesamiento
        if (error.code === 10062) {
            // Este error es normal si el bot tarda > 3s y es seguro ignorarlo.
            console.warn('[WARN] Se intentó responder a una interacción que ya había expirado.');
            return;
        }
        
        console.error('[ERROR DE INTERACCIÓN]', error);
        
        // Intentamos notificar al usuario del error
        try {
            const errorMessage = { content: '❌ Hubo un error al procesar tu solicitud.', flags: [MessageFlags.Ephemeral] };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (e) {
            // Evitamos un bucle de errores si la notificación del error también falla
            if (e.code !== 10062 && e.code !== 40060) {
                 console.error("Error al enviar mensaje de error de interacción:", e.message);
            }
        }
    }
});

// Evento para la traducción de mensajes
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;
    await handleMessageTranslation(message);
});

// Función de arranque principal del bot
async function startBot() {
    // 1. Conectar a la base de datos
    await connectDb();
    // 2. Iniciar el servidor web para mantener el bot activo en Render
    keepAlive();
    // 3. Iniciar sesión en Discord
    client.login(process.env.DISCORD_TOKEN);
}

// ¡Llamamos a la función para que todo comience!
startBot();
