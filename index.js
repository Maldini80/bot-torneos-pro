import { Client, GatewayIntentBits, Events, MessageFlags, EmbedBuilder } from 'discord.js';
import { startVisualizerServer } from './visualizerServer.js';
import { advanceDraftTurn, handlePlayerSelectionFromWeb } from './src/logic/tournamentLogic.js';
import 'dotenv/config';
import { connectDb, getDb } from './database.js';
import { getMadridTime } from './src/utils/timeHelper.js';
import { syncFantasyWithVpg, runMarketAutomation } from './src/utils/fantasyVpgSync.js';
import { handleCommand } from './src/handlers/commandHandler.js';
import { handleButton } from './src/handlers/buttonHandler.js';
import { handleModal } from './src/handlers/modalHandler.js';
import { handleSelectMenu } from './src/handlers/selectMenuHandler.js';
import { handleMessageTranslation } from './src/logic/translationLogic.js';
import { updateAdminPanel, updateAllManagementPanels, updateAllDraftManagementPanels } from './src/utils/panelManager.js'
import { checkOverdueMatches } from './src/logic/matchLogic.js';
import { CHANNELS } from './config.js';

process.on('uncaughtException', (error, origin) => {
    console.error('💥 ERROR FATAL NO CAPTURADO:');
    console.error(error);
    console.error('💥 ORIGEN DEL ERROR:');
    console.error(origin);
});

// FIX: Capturar promesas rechazadas que antes mataban el proceso silenciosamente
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ PROMESA RECHAZADA SIN CAPTURAR:');
    console.error(reason);
});

export let isBotBusy = false;
export async function setBotBusy(status) {
    isBotBusy = status;
    await updateAdminPanel(client);
    await updateAllManagementPanels(client, status);
    // NUEVO: Actualizar también los paneles de gestión de drafts
    await updateAllDraftManagementPanels(client, status);
}

export const client = new Client({
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
            const members = await guild.members.fetch({});
            console.log(`[CACHE] Carga completa. ${members.size} miembros están ahora en la caché.`);

            // AUTO-ROLE SYNC: Sync roles for verified users in database
            try {
                const db = getDb();
                if (db) {
                    const { VERIFIED_ROLE_ID } = await import('./config.js');
                    const verifiedRole = await guild.roles.fetch(VERIFIED_ROLE_ID).catch(() => null);
                    if (verifiedRole) {
                        console.log('[SYNC] Iniciando sincronización de roles verificados...');
                        // Manually correct nauarmdar's Discord ID if it's the old/incorrect one
                        try {
                            const oldNau = await db.collection('verified_users').findOne({ discordId: '435171084577538059' });
                            if (oldNau) {
                                console.log('[SYNC] Corrigiendo ID de Discord de nauarmdar de 435171084577538059 a 861938417842913312...');
                                await db.collection('verified_users').updateOne(
                                    { discordId: '435171084577538059' },
                                    { $set: { discordId: '861938417842913312', username: 'nauarmdar' } }
                                );
                            }
                        } catch (fixErr) {
                            console.error('[SYNC] Error al corregir ID de nauarmdar:', fixErr);
                        }

                        const verifiedUsers = await db.collection('verified_users').find({}).toArray();
                        console.log(`[SYNC] Encontrados ${verifiedUsers.length} usuarios verificados en la base de datos.`);

                        let syncedCount = 0;
                        for (const user of verifiedUsers) {
                            const member = guild.members.cache.get(user.discordId) || await guild.members.fetch(user.discordId).catch(() => null);
                            if (member && !member.roles.cache.has(VERIFIED_ROLE_ID)) {
                                await member.roles.add(verifiedRole).catch(err => {
                                    console.error(`[SYNC] Error al añadir rol verificado a ${member.user.tag}:`, err.message);
                                });
                                syncedCount++;
                                console.log(`[SYNC] Rol verificado (${verifiedRole.name}) asignado a ${member.user.tag} automáticamente.`);
                            }
                        }
                        console.log(`[SYNC] Sincronización finalizada. Se asignaron ${syncedCount} roles.`);
                    } else {
                        console.warn('[SYNC] No se encontró el rol verificado con ID:', VERIFIED_ROLE_ID);
                    }
                }
            } catch (syncErr) {
                console.error('[SYNC] Error durante la sincronización de roles verificados:', syncErr);
            }
        } else {
            console.error(`[CRASH EN READY] No se pudo encontrar el servidor con ID: ${process.env.GUILD_ID}. Verifica las variables de entorno.`);
        }

        // FIX: Force update panels on startup to clear "Busy" state from crashes
        console.log('[STARTUP] Forzando actualización de paneles para limpiar estados bloqueados...');
        await setBotBusy(false);

        // AUTO-RESULTS: Iniciar detector automático si hay torneos activos con autoResults habilitado
        const db = getDb();
        if (db) {
            const activeAutoTournaments = await db.collection('tournaments').countDocuments({
                'config.autoResults': true,
                status: { $nin: ['finalizado', 'cancelado', 'inscripcion_abierta', 'archivado'] }
            });
            if (activeAutoTournaments > 0) {
                console.log(`[STARTUP] Detectados ${activeAutoTournaments} torneos con auto-resultados activos. Iniciando detector automático...`);
                const { startAutoResults } = await import('./src/utils/autoResultsDetector.js');
                startAutoResults(readyClient);
            } else {
                console.log('[STARTUP] No hay torneos activos con auto-resultados habilitados.');
            }
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
        if (interaction.isChatInputCommand() || interaction.isAutocomplete()) await handleCommand(interaction);
        else if (interaction.isButton()) await handleButton(interaction);
        else if (interaction.isModalSubmit()) await handleModal(interaction);
        else if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) await handleSelectMenu(interaction);
    } catch (error) {
        // --- INICIO DE LA MODIFICACIÓN ---
        // Ignoramos los errores comunes de tiempo de respuesta que no son críticos.
        const knownDiscordErrors = [
            10062, // Unknown interaction (ha expirado por el tiempo)
            40060, // Interaction has already been acknowledged (ya fue respondida o expiró)
            10008  // Unknown Message (mensaje efímero expirado o canal borrado)
        ];

        if (error.code && knownDiscordErrors.includes(error.code)) {
            console.warn(`[WARN] Se ignoró un error de interacción conocido (${error.code}). Probablemente por un cold start del servidor.`);
            return;
        }
        // --- FIN DE LA MODIFICACIÓN ---

        console.error('[ERROR DE INTERACCIÓN]', error);

        try {
            const errorMessage = { content: '❌ Hubo un error al procesar tu solicitud.', flags: [MessageFlags.Ephemeral] };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (e) {
            // No hacemos nada si falla el mensaje de error, para evitar bucles.
            console.error("No se pudo enviar el mensaje de error de la interacción:", e.message);
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
                await message.delete().catch(() => { });
            }
        }
    } catch (error) {
        console.error("Error en el detector de enlaces de pruebas:", error);
    }
});

client.on(Events.MessageDelete, async message => {
    if (message.channelId !== CHANNELS.TOURNAMENTS_STATUS) return;
    if (message.author?.id !== client.user.id) return;

    console.log(`[SYNC] Panel de torneo borrado en el canal de estado. Forzando actualización de icono.`);
});

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { startVpgBot, setVpgClient } = require('./src/vpg_bot/index.js');

async function startBot() {
    await connectDb();
    
    await startVisualizerServer(client, advanceDraftTurn, handlePlayerSelectionFromWeb);
    client.login(process.env.DISCORD_TOKEN);

    // Iniciar el segundo bot (VPG) y guardar el client
    const vpgClient = await startVpgBot();
    setVpgClient(vpgClient);
    console.log('[VPG] Client del VPG Bot guardado para notificaciones web');

    // FIX: Proteger con .catch() para que un error transitorio no mate el proceso
    setInterval(() => {
        checkOverdueMatches(client).catch(err => {
            console.error('[VIGILANTE] Error en checkOverdueMatches:', err.message);
        });
    }, 60000);

    // NUEVO: Scheduler dinámico minuto a minuto para el Fantasy
    setInterval(async () => {
        try {
            const db = getDb();
            if (!db) return;

            const schedules = await db.collection('fantasy_config').findOne({ key: 'schedules' });
            if (!schedules) return;

            const mTime = getMadridTime();
            const hourMinStr = `${String(mTime.hours).padStart(2, '0')}:${String(mTime.minutes).padStart(2, '0')}`;
            const dateStr = `${mTime.year}-${String(mTime.month + 1).padStart(2, '0')}-${String(mTime.date).padStart(2, '0')}`;
            const runKey = `${dateStr} ${hourMinStr}`;

            // 1. Verificar Suma de Puntos (VPG Sync)
            if (schedules.points && schedules.points.active) {
                const pSched = schedules.points;
                const activeDays = pSched.days || [0,1,2,3,4,5,6];
                if (activeDays.includes(mTime.day) && pSched.time === hourMinStr) {
                    if (pSched.lastRun !== runKey) {
                        console.log(`[SCHEDULER] Iniciando Suma de Puntos programada a las ${hourMinStr} (Madrid)...`);
                        // Actualizar en base de datos para prevenir duplicados inmediatos
                        await db.collection('fantasy_config').updateOne(
                            { key: 'schedules' },
                            { $set: { "points.lastRun": runKey } }
                        );
                        
                        syncFantasyWithVpg().catch(err => {
                            console.error('[SCHEDULER] Error en syncFantasyWithVpg:', err);
                        });
                    }
                }
            }

            // 2. Verificar Ventanas de Mercado
            if (schedules.market && schedules.market.active) {
                const mSched = schedules.market;
                const activeDays = mSched.days || [0,1,2,3,4,5,6];
                if (activeDays.includes(mTime.day)) {
                    const matchedWindow = (mSched.windows || []).find(w => w === hourMinStr);
                    if (matchedWindow) {
                        if (mSched.lastRun !== runKey) {
                            console.log(`[SCHEDULER] Iniciando Adjudicación de Mercado programada a las ${hourMinStr} (Madrid)...`);
                            // Actualizar lastRun
                            await db.collection('fantasy_config').updateOne(
                                { key: 'schedules' },
                                { $set: { "market.lastRun": runKey } }
                            );

                            runMarketAutomation().catch(err => {
                                console.error('[SCHEDULER] Error en runMarketAutomation:', err);
                            });
                        }
                    }
                }
            }
        } catch (schedErr) {
            console.error('[SCHEDULER] Error en el loop de verificación de horarios:', schedErr.message);
        }
    }, 60000);
}

startBot();
