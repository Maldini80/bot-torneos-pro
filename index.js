// index.js - VERSIÓN 2.2 - ESTADO AUTOSUFICIENTE Y ROBUSTO
require('dotenv').config();

const keepAlive = require('./keep_alive.js');
const { connectDb, saveData, loadInitialData } = require('./database.js'); 

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { translate } = require('@vitalets/google-translate-api');

let botData;
let torneoActivo;
// --- ARQUITECTURA --- Estas variables ahora son solo para acceso rápido en memoria.
// La "fuente de la verdad" ahora reside dentro de torneoActivo.
let mensajeInscripcionId;
let listaEquiposMessageId;

// --- CORRECCIÓN FINAL --- El guardado ahora es simple y atómico.
// Solo necesita guardar el objeto torneoActivo, que contiene todo.
function saveBotState() {
    if (!botData) return;
    botData.torneoActivo = JSON.parse(JSON.stringify(torneoActivo));
    saveData(botData);
}

// --- CONFIGURACIÓN ---
const ADMIN_CHANNEL_ID = '1393187598796587028';
const ARBITRO_ROLE_ID = '1393505777443930183';
const INSCRIPCION_CHANNEL_ID = '1393942335645286412';
const PARTICIPANTE_ROLE_ID = '1394321301748977684'; 
const EQUIPOS_INSCRITOS_CHANNEL_ID = '1394444703822381076';
const CLASIFICACION_CHANNEL_ID = '1394445078948220928';
const MATCH_THREADS_PARENT_ID = '1394452077282988063'; 
const CALENDARIO_JORNADAS_CHANNEL_ID = '1394577975412002816'; 
const SETUP_COMMAND = '!setup-idiomas';

const ACTIVE_STATUS_ICON = '🟢';
const INACTIVE_STATUS_ICON = '🔴';
const PENDING_STATUS_ICON = '🟡';
const FULL_STATUS_ICON = '🟠';

const CHANNELS_CONFIG = {
    inscripciones: { id: INSCRIPCION_CHANNEL_ID, baseName: '🤝-inscripciones-inscriptions' },
    capitanes: { id: EQUIPOS_INSCRITOS_CHANNEL_ID, baseName: '📋-capitanes-inscritos' },
    clasificacion: { id: CLASIFICACION_CHANNEL_ID, baseName: '📊-clasificacion-ranking' },
    calendario: { id: CALENDARIO_JORNADAS_CHANNEL_ID, baseName: '🗓-calendario-de-jornadas' }
};

const TOURNAMENT_FORMATS = {
    '8_teams_semis_classic': { label: '8 Equipos (Clásico - Semifinales)', description: '2 grupos de 4. Los 2 primeros de cada grupo a semifinales.', size: 8, groups: 2, qualifiersPerGroup: 2, knockoutStages: ['semifinales', 'final'] },
    '8_teams_final': { label: '8 Equipos (Nuevo - Final Directa)', description: '2 grupos de 4. El 1º de cada grupo va a la final.', size: 8, groups: 2, qualifiersPerGroup: 1, knockoutStages: ['final'] },
    '16_teams_quarters_classic': { label: '16 Equipos (Clásico - Cuartos)', description: '4 grupos de 4. El 1º de cada grupo a cuartos de final.', size: 16, groups: 4, qualifiersPerGroup: 1, knockoutStages: ['cuartos', 'semifinales', 'final'] },
    '16_teams_quarters_new': { label: '16 Equipos (Nuevo - Cuartos)', description: '4 grupos de 4. Los 2 primeros de cada grupo a cuartos.', size: 16, groups: 4, qualifiersPerGroup: 2, knockoutStages: ['cuartos', 'semifinales', 'final'] },
    '32_teams_quarters': { label: '32 Equipos (Cuartos de Final)', description: '8 grupos de 4. El 1º de cada grupo clasifica a cuartos.', size: 32, groups: 8, qualifiersPerGroup: 1, knockoutStages: ['cuartos', 'semifinales', 'final'] },
    '32_teams_ro16': { label: '32 Equipos (Octavos de Final)', description: '8 grupos de 4. Los 2 primeros clasifican a octavos.', size: 32, groups: 8, qualifiersPerGroup: 2, knockoutStages: ['octavos', 'cuartos', 'semifinales', 'final'] }
};

const languageRoles = {
    '🇪🇸': { name: 'Español', code: 'es' }, '🇮🇹': { name: 'Italiano', code: 'it' }, '🇬🇧': { name: 'English', code: 'en' },
    '🇫🇷': { name: 'Français', code: 'fr' }, '🇵🇹': { name: 'Português', code: 'pt' }, '🇩🇪': { name: 'Deutsch', code: 'de' },
    '🇹🇷': { name: 'Türkçe', code: 'tr' }
};

const LANGUAGE_SETUP_TITLE = '🌍 Selección de Idioma / Language Selection';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// (El resto de las funciones auxiliares como 'actualizarNombresCanalesConIcono', 'createMatchObject', etc., no necesitan cambios)
// ... (mismas funciones hasta handleSlashCommand)
async function actualizarNombresCanalesConIcono() {
    let statuses = {};

    if (!torneoActivo) {
        statuses = { inscripciones: INACTIVE_STATUS_ICON, capitanes: INACTIVE_STATUS_ICON, clasificacion: INACTIVE_STATUS_ICON, calendario: INACTIVE_STATUS_ICON };
    } else if (torneoActivo.status === 'inscripcion_abierta') {
        const cupoLLeno = Object.keys(torneoActivo.equipos_aprobados).length >= torneoActivo.size;
        const iconInsc = cupoLLeno ? FULL_STATUS_ICON : ACTIVE_STATUS_ICON;
        statuses = { inscripciones: iconInsc, capitanes: iconInsc, clasificacion: PENDING_STATUS_ICON, calendario: PENDING_STATUS_ICON };
    } else if (['fase_de_grupos', 'octavos', 'cuartos', 'semifinales', 'final'].includes(torneoActivo.status)) {
        statuses = { inscripciones: FULL_STATUS_ICON, capitanes: FULL_STATUS_ICON, clasificacion: ACTIVE_STATUS_ICON, calendario: ACTIVE_STATUS_ICON };
    } else { 
        statuses = { inscripciones: INACTIVE_STATUS_ICON, capitanes: INACTIVE_STATUS_ICON, clasificacion: INACTIVE_STATUS_ICON, calendario: INACTIVE_STATUS_ICON };
    }

    const promises = Object.keys(CHANNELS_CONFIG).map(async (key) => {
        const config = CHANNELS_CONFIG[key];
        try {
            const channel = await client.channels.fetch(config.id);
            if (!channel) return;
            
            const targetIcon = statuses[key] || INACTIVE_STATUS_ICON;
            const newName = `${targetIcon} ${config.baseName}`;

            if (channel.name !== newName) {
                await channel.setName(newName);
            }
        } catch (error) {
            if (error.code !== 10003) { console.error(`Error al actualizar el nombre del canal ${config.id}:`, error); }
        }
    });
    await Promise.all(promises);
}

function createMatchObject(nombreGrupo, jornada, equipoA, equipoB) {
    const cleanEquipoA = JSON.parse(JSON.stringify(equipoA));
    const cleanEquipoB = JSON.parse(JSON.stringify(equipoB));

    return {
        matchId: `match_${Date.now()}_${cleanEquipoA.nombre.slice(0,3)}_${cleanEquipoB.nombre.slice(0,3)}`,
        nombreGrupo,
        jornada,
        equipoA: cleanEquipoA,
        equipoB: cleanEquipoB,
        resultado: null,
        reportedScores: {},
        status: 'en_curso',
        threadId: null
    };
}

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
        if (err.code !== 10003 && err.code !== 10008) { 
             console.error(`Error al limpiar el canal ${channelId}:`, err); 
        }
    }
}

async function crearHiloDePartido(guild, partido, tipoPartido = 'Grupo') {
    const parentChannel = await client.channels.fetch(MATCH_THREADS_PARENT_ID).catch(() => null);
    if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
        console.error(`[ERROR FATAL] El canal padre para hilos (ID: ${MATCH_THREADS_PARENT_ID}) no existe o no es un canal de texto.`);
        return;
    }

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
    const threadName = `⚔️-${baseChannelName}`;

    try {
        const thread = await parentChannel.threads.create({
            name: threadName,
            autoArchiveDuration: 1440,
            type: ChannelType.PrivateThread,
            reason: `Partido de torneo: ${partido.equipoA.nombre} vs ${partido.equipoB.nombre}`
        });

        partido.threadId = thread.id;

        const memberPromises = [];
        memberPromises.push(thread.members.add(partido.equipoA.capitanId).catch(err => console.error(`No se pudo añadir al capitán ${partido.equipoA.capitanTag} al hilo.`)));
        memberPromises.push(thread.members.add(partido.equipoB.capitanId).catch(err => console.error(`No se pudo añadir al capitán ${partido.equipoB.capitanTag} al hilo.`)));
        
        const arbitroRole = await guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);
        if (arbitroRole) {
            arbitroRole.members.forEach(member => {
                memberPromises.push(thread.members.add(member.id).catch(()=>{}));
            });
        }
        await Promise.all(memberPromises);
        
        const embed = new EmbedBuilder().setColor('#3498db').setTitle(`Partido: ${partido.equipoA.nombre} vs ${partido.equipoB.nombre}`).setDescription(`${description}\n\n🇪🇸 Usad este hilo para coordinar y jugar. Cuando terminéis, usad los botones.\n\n🇬🇧 *Use this thread to coordinate and play. When you finish, use the buttons.*`);
        
        const captainButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`reportar_resultado_v3_${partido.matchId}`).setLabel("Reportar Resultado / Report Result").setStyle(ButtonStyle.Primary).setEmoji("📊"),
            new ButtonBuilder().setCustomId(`upload_highlights_${partido.matchId}`).setLabel("Subir Alturas / Upload Highlights").setStyle(ButtonStyle.Secondary).setEmoji("🎬"),
            new ButtonBuilder().setCustomId(`solicitar_arbitraje_${partido.matchId}`).setLabel("Solicitar Arbitraje / Request Referee").setStyle(ButtonStyle.Danger).setEmoji("⚠️")
        );

        const adminButtons = new ActionRowBuilder().addComponents(
             new ButtonBuilder().setCustomId(`admin_modificar_resultado_${partido.matchId}`).setLabel("Modificar Resultado (Admin)").setStyle(ButtonStyle.Secondary).setEmoji("✍️")
        );

        await thread.send({ content: `<@${partido.equipoA.capitanId}> y <@${partido.equipoB.capitanId}>`, embeds: [embed], components: [captainButtons, adminButtons] });
        console.log(`[INFO] Hilo de partido creado: ${thread.name}`);

    } catch (error) {
        console.error(`[ERROR FATAL] No se pudo crear el hilo del partido.`, error);
        throw error;
    }
}

async function updateMatchThreadName(partido) {
    if (!partido.threadId) return;
    try {
        const thread = await client.channels.fetch(partido.threadId);
        if (!thread) return;
        const cleanBaseName = thread.name.replace(/^[⚔️✅⚠️]-/g, '').replace(/-\d+a\d+$/, '');
        let icon;
        if (partido.status === 'finalizado') icon = '✅';
        else if (partido.status === 'arbitraje') icon = '⚠️';
        else icon = '⚔️';
        let newName = `${icon}-${cleanBaseName}`;
        if (partido.status === 'finalizado' && partido.resultado) {
             const resultString = partido.resultado.replace('-', 'a');
             newName = `${newName}-${resultString}`;
        }
        await thread.setName(newName.slice(0, 100));
    } catch(err) {
        if (err.code !== 10003) { console.error(`Error al renombrar hilo ${partido.threadId}:`, err); }
    }
}

async function mostrarMensajeEspera() {
    const waitEmbed = new EmbedBuilder()
        .setColor('#34495e')
        .setTitle('⏳ 🇪🇸 Torneo en Espera / 🇬🇧 Tournament on Standby')
        .setDescription('**🇪🇸 Actualmente no hay ningún torneo activo.**\n\nPronto se anunciará el próximo. ¡Estad atentos!\n\n---\n\n***🇬🇧 There are currently no active tournaments.***\n\nThe next one will be announced soon. Stay tuned!')
        .setThumbnail('https://i.imgur.com/gJAFbJq.png');

    const channelsToUpdate = [
        INSCRIPCION_CHANNEL_ID,
        EQUIPOS_INSCRITOS_CHANNEL_ID,
        CLASIFICACION_CHANNEL_ID,
        CALENDARIO_JORNADAS_CHANNEL_ID
    ];

    for (const channelId of channelsToUpdate) {
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel) {
                await limpiarCanal(channelId);
                await channel.send({ embeds: [waitEmbed] });
            }
        } catch (err) {
            if (err.code === 10003) { 
                console.warn(`[WARN] El canal de espera con ID ${channelId} no fue encontrado. Se ignora.`);
            } else {
                console.error(`[ERROR] No se pudo actualizar el canal de espera ${channelId}:`, err);
            }
        }
    }
}


client.once('ready', async () => {
    console.log(`Bot conectado como ${client.user.tag}!`);
    await actualizarNombresCanalesConIcono();
});

client.on('guildMemberAdd', member => {
    const welcomeEmbed = new EmbedBuilder().setColor('#2ecc71').setTitle(`👋 ¡Bienvenido a ${member.guild.name}! / Welcome to ${member.guild.name}!`).setDescription('🇪🇸 Para continuar, por favor, selecciona tu idioma.\n\n🇬🇧 *To continue, please select your language.*');
    const row = new ActionRowBuilder();
    const flags = Object.keys(languageRoles);
    for (let i = 0; i < flags.length && i < 5; i++) {
        const flag = flags[i];
        row.addComponents(new ButtonBuilder().setCustomId(`rules_${languageRoles[flag].code}_${member.guild.id}`).setLabel(languageRoles[flag].name).setEmoji(flag).setStyle(ButtonStyle.Secondary));
    }
    member.send({ embeds: [welcomeEmbed], components: [row] }).catch(() => console.log(`No se pudo enviar DM a ${member.user.tag}.`));
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const sensitiveIds = ['panel_finalizar', 'panel_borrar_hilos', 'panel_reset_force', 'admin_aprobar', 'admin_expulsar', 'admin_rechazar'];
        if (sensitiveIds.some(id => interaction.customId.startsWith(id))) {
            if (!interaction.isModalSubmit()) {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            }
        }
    }
    
    try {
        if (interaction.isCommand()) {
            await handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButton(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
    } catch (error) {
        if (error.code === 40060 || error.code === 10062) {
            return; 
        }
        console.error('Ha ocurrido un error en el manejador de interacciones:', error);
        try {
            const replyOptions = { content: '🇪🇸 Hubo un error al procesar tu solicitud.\n🇬🇧 *An error occurred while processing your request.*', flags: [MessageFlags.Ephemeral] };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyOptions);
            } else {
                 await interaction.reply(replyOptions);
            }
        } catch (e) {
            if (e.code !== 10062) {
                console.error('Error al enviar mensaje de error de interacción:', e);
            }
        }
    }
});


async function handleSlashCommand(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '🇪🇸 No tienes permisos para usar este comando.\n🇬🇧 You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
    }
    const { commandName } = interaction;
    if (commandName === 'panel-admin') {
        const embed = new EmbedBuilder()
            .setColor('#2c3e50')
            .setTitle('Panel de Control del Torneo')
            .setDescription('🇪🇸 Usa los botones de abajo para gestionar el torneo.\n🇬🇧 Use the buttons below to manage the tournament.')
            .setFooter({ text: 'ESTADO: ✅ LISTO PARA OPERAR' });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_crear').setLabel('Crear Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆'), 
            new ButtonBuilder().setCustomId('panel_add_test').setLabel('Añadir Equipos Prueba').setStyle(ButtonStyle.Secondary).setEmoji('🧪')
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_ver_inscritos').setLabel('Ver Inscritos').setStyle(ButtonStyle.Primary).setEmoji('📋'),
            new ButtonBuilder().setCustomId('panel_ver_pendientes').setLabel('Ver Pendientes').setStyle(ButtonStyle.Primary).setEmoji('⏳')
        );
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_simular_partidos').setLabel('Simular Partidos').setStyle(ButtonStyle.Secondary).setEmoji('🎲'), 
            new ButtonBuilder().setCustomId('panel_borrar_hilos').setLabel('Borrar Hilos').setStyle(ButtonStyle.Danger).setEmoji('🗑️'), 
            new ButtonBuilder().setCustomId('panel_finalizar').setLabel('Finalizar Torneo').setStyle(ButtonStyle.Danger).setEmoji('🛑'),
            new ButtonBuilder().setCustomId('panel_reset_force').setLabel('Reset Forzado').setStyle(ButtonStyle.Danger).setEmoji('🚨')
        );
        await interaction.channel.send({ embeds: [embed], components: [row1, row2, row3] });
        return interaction.reply({ content: 'Panel de control creado.', flags: [MessageFlags.Ephemeral] });
    }
    
    if (commandName === 'sortear-grupos') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        if (!torneoActivo) return interaction.editReply({ content: 'No hay ningún torneo activo para sortear.' });
        if (torneoActivo.status === 'fase_de_grupos') return interaction.editReply({ content: 'El torneo ya ha sido sorteado.' });
        const equiposAprobadosCount = Object.keys(torneoActivo.equipos_aprobados || {}).length;
        if (equiposAprobadosCount < torneoActivo.size) return interaction.editReply({ content: `No hay suficientes equipos. Se necesitan ${torneoActivo.size} y hay ${equiposAprobadosCount}.` });
        await interaction.editReply({ content: 'Iniciando sorteo manualmente...' });
        await realizarSorteoDeGrupos(interaction.guild);
        return;
    }
    
    if (commandName === 'iniciar-eliminatorias') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        await iniciarFaseEliminatoria(interaction.guild);
        await interaction.editReply({ content: 'Fase eliminatoria iniciada.'});
    }
}

async function forceResetTournamentState(interaction) {
    const adminPanelMessage = interaction.message;
    try {
        const components = adminPanelMessage.components.map(row => ActionRowBuilder.from(row));
        components.forEach(row => row.components.forEach(button => button.setDisabled(true)));
        const busyEmbed = EmbedBuilder.from(adminPanelMessage.embeds[0]).setColor('#FF0000').setFooter({ text: 'ESTADO: 🔴 OCUPADO\nTarea: Reseteo forzado en curso...' });
        await adminPanelMessage.edit({ embeds: [busyEmbed], components });

        console.log(`[FORCE RESET] Invocado por ${interaction.user.tag}.`);
        
        torneoActivo = null;
        // --- CORRECCIÓN FINAL --- Asegurarse de limpiar las variables de acceso rápido.
        mensajeInscripcionId = null;
        listaEquiposMessageId = null;
        saveBotState();
        console.log('[FORCE RESET] Estado del bot reseteado en memoria y base de datos.');

        await mostrarMensajeEspera();
        await actualizarNombresCanalesConIcono();
        
        await interaction.editReply({ content: '✅ ¡Estado del bot reseteado a la fuerza! El bot está listo para un nuevo torneo.' });
    } catch (error) {
        console.error("Ocurrió un error durante el reseteo forzado:", error);
        await interaction.editReply({ content: '❌ Ocurrió un error al intentar limpiar la interfaz, pero el estado del bot ha sido reseteado.' });
    } finally {
        const components = adminPanelMessage.components.map(row => ActionRowBuilder.from(row));
        components.forEach(row => row.components.forEach(button => button.setDisabled(false)));
        const readyEmbed = EmbedBuilder.from(adminPanelMessage.embeds[0]).setColor('#2c3e50').setFooter({ text: 'ESTADO: ✅ LISTO PARA OPERAR\nÚltima acción: Reseteo forzado completado.' });
        await adminPanelMessage.edit({ embeds: [readyEmbed], components });
    }
}


async function handleButton(interaction) {
    const { customId } = interaction;
    const isDeferred = interaction.deferred;
    
    if (customId.startsWith('panel_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permisos para usar los botones del panel.', flags: [MessageFlags.Ephemeral] });
        }
        
        const [panel, type, subtype] = customId.split('_');
        
        if (type === 'crear') {
             if (torneoActivo) {
                return interaction.reply({ content: '❌ Ya hay un torneo activo. Finalízalo o usa "Reset Forzado" antes de crear uno nuevo.', flags: [MessageFlags.Ephemeral] });
            }
            const formatMenu = new StringSelectMenuBuilder()
                .setCustomId('crear_torneo_format_select')
                .setPlaceholder('Paso 1: Selecciona el formato del torneo')
                .addOptions(
                    Object.keys(TOURNAMENT_FORMATS).map(key => ({
                        label: TOURNAMENT_FORMATS[key].label,
                        description: TOURNAMENT_FORMATS[key].description,
                        value: key
                    }))
                );
            const row = new ActionRowBuilder().addComponents(formatMenu);
            return interaction.reply({ content: 'Iniciando creación de torneo...', components: [row], flags: [MessageFlags.Ephemeral] });
        }
        if (type === 'add' && subtype === 'test') {
            if (!torneoActivo) {
                return interaction.reply({ content: '❌ Error: Primero debes terminar de crear un torneo.', flags: [MessageFlags.Ephemeral] });
            }
            const modal = new ModalBuilder().setCustomId('add_test_modal').setTitle('Añadir Equipos de Prueba');
            const cantidadInput = new TextInputBuilder().setCustomId('cantidad_input').setLabel("¿Cuántos equipos de prueba quieres añadir?").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(cantidadInput));
            return interaction.showModal(modal);
        }
        
        if (type === 'reset' && subtype === 'force') {
            return await forceResetTournamentState(interaction);
        }

        if (type === 'finalizar') {
            if (!torneoActivo) {
                return interaction.editReply({ content: 'No hay ningún torneo activo para finalizar.' });
            }

            const adminPanelMessage = interaction.message;
            try {
                const components = adminPanelMessage.components.map(row => ActionRowBuilder.from(row));
                components.forEach(row => row.components.forEach(button => button.setDisabled(true)));
                let busyEmbed = EmbedBuilder.from(adminPanelMessage.embeds[0]).setColor('#FF0000').setFooter({ text: 'ESTADO: 🔴 OCUPADO\nTarea: Reseteando estado interno...' });
                await adminPanelMessage.edit({ embeds: [busyEmbed], components });

                const nombreTorneoFinalizado = torneoActivo.nombre;
                torneoActivo = null;
                // --- CORRECCIÓN FINAL --- Limpiar las variables de acceso rápido
                mensajeInscripcionId = null;
                listaEquiposMessageId = null;
                saveBotState();
                console.log(`[FINISH] Estado del torneo ${nombreTorneoFinalizado} reseteado.`);
                await interaction.editReply({ content: 'Finalizando torneo... Estado interno reseteado. Limpiando interfaz...' });

                busyEmbed.setFooter({ text: 'ESTADO: 🔴 OCUPADO\nTarea: Borrando hilos de partido...' });
                await adminPanelMessage.edit({ embeds: [busyEmbed] });

                const parentChannel = await client.channels.fetch(MATCH_THREADS_PARENT_ID).catch(() => null);
                if (parentChannel) {
                    const threads = await parentChannel.threads.fetch();
                    const deletePromises = [];
                    for (const thread of threads.threads.values()) {
                        deletePromises.push(thread.delete('Finalización de torneo.').catch(() => {}));
                    }
                    await Promise.all(deletePromises);
                }

                busyEmbed.setFooter({ text: 'ESTADO: 🔴 OCUPADO\nTarea: Limpiando canales principales...' });
                await adminPanelMessage.edit({ embeds: [busyEmbed] });
                
                await mostrarMensajeEspera();
                await actualizarNombresCanalesConIcono();
                
                await interaction.followUp({ content: '✅ Torneo finalizado y estado del bot reseteado correctamente.', flags: [MessageFlags.Ephemeral] });

            } catch (error) {
                console.error("Ocurrió un error durante la finalización del torneo:", error);
                await interaction.followUp({ content: '❌ Ocurrió un error al limpiar la interfaz, pero el estado del bot ya ha sido reseteado.', flags: [MessageFlags.Ephemeral] });
            } finally {
                const components = adminPanelMessage.components.map(row => ActionRowBuilder.from(row));
                components.forEach(row => row.components.forEach(button => button.setDisabled(false)));
                const readyEmbed = EmbedBuilder.from(adminPanelMessage.embeds[0]).setColor('#2c3e50').setFooter({ text: `ESTADO: ✅ LISTO PARA OPERAR\nÚltima acción: Torneo finalizado.` });
                await adminPanelMessage.edit({ embeds: [readyEmbed], components });
            }
            return;
        }

        if(!isDeferred) await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        if (type === 'ver' && subtype === 'inscritos') {
            if (!torneoActivo || Object.keys(torneoActivo.equipos_aprobados || {}).length === 0) {
                return interaction.editReply({ content: 'No hay equipos inscritos (aprobados) en este momento.' });
            }
            const listaEquipos = Object.values(torneoActivo.equipos_aprobados).map((equipo, index) => `${index + 1}. ${equipo.bandera || '🏳️'} **${equipo.nombre}** (Capitán: ${equipo.capitanTag})`).join('\n');
            const embed = new EmbedBuilder().setTitle('📋 Lista de Equipos Inscritos').setDescription(listaEquipos).setColor('#3498DB').setFooter({ text: `Total: ${Object.keys(torneoActivo.equipos_aprobados).length} / ${torneoActivo.size}` });
            return interaction.editReply({ embeds: [embed] });
        }

        if (type === 'ver' && subtype === 'pendientes') {
            if (!torneoActivo || Object.keys(torneoActivo.equipos_pendientes || {}).length === 0) {
                return interaction.editReply({ content: 'No hay equipos pendientes de aprobación en este momento.' });
            }
            const listaPendientes = Object.values(torneoActivo.equipos_pendientes).map((equipo, index) => `${index + 1}. **${equipo.nombre}** (Capitán: ${equipo.capitanTag}) - PayPal: \`${equipo.paypal || 'No especificado'}\``).join('\n');
            const embed = new EmbedBuilder().setTitle('⏳ Lista de Equipos Pendientes de Aprobación').setDescription(listaPendientes).setColor('#E67E22');
            return interaction.editReply({ embeds: [embed] });
        }
        
        if (type === 'simular' && subtype === 'partidos') {
            if (!torneoActivo || !['fase_de_grupos', 'octavos', 'cuartos', 'semifinales', 'final'].includes(torneoActivo.status)) {
                 return interaction.editReply({ content: 'Solo se pueden simular partidos durante una fase activa del torneo.' });
            }
            
            let partidosActivos = findMatch(null, true);
            let partidosASimular = partidosActivos.filter(p => p.threadId && p.status !== 'finalizado');

            if (partidosASimular.length === 0) {
                return interaction.editReply({ content: 'No hay partidos activos (con hilo creado) para simular en este momento.' });
            }
            
            await interaction.editReply({ content: `Simulando ${partidosASimular.length} partidos activos...` });

            for (const partido of partidosASimular) {
                const golesA = Math.floor(Math.random() * 5);
                const golesB = Math.floor(Math.random() * 5);
                partido.resultado = `${golesA}-${golesB}`;
                partido.status = 'finalizado';
                await procesarResultadoFinal(partido, interaction, true); 
            }
            
            saveBotState();
            await interaction.followUp({ content: `✅ Se han simulado ${partidosASimular.length} partidos. La clasificación ha sido actualizada y se han creado los hilos para la siguiente ronda si procede.` });
            return;
        } 
        
        if (type === 'borrar' && subtype === 'hilos') {
            const adminPanelMessage = interaction.message;
            try {
                const components = adminPanelMessage.components.map(row => ActionRowBuilder.from(row));
                components.forEach(row => row.components.forEach(button => button.setDisabled(true)));
                let busyEmbed = EmbedBuilder.from(adminPanelMessage.embeds[0]).setColor('#FF0000').setFooter({ text: 'ESTADO: 🔴 OCUPADO\nTarea: Borrando hilos...' });
                await adminPanelMessage.edit({ embeds: [busyEmbed], components });

                const parentChannel = await client.channels.fetch(MATCH_THREADS_PARENT_ID).catch(()=>null);
                if (!parentChannel) return interaction.editReply({ content: `Error: No se encontró el canal padre de hilos (ID: ${MATCH_THREADS_PARENT_ID})`});
            
                const threads = await parentChannel.threads.fetch();
                const matchThreads = threads.threads;
            
                await interaction.editReply({ content: `Borrando ${matchThreads.size} hilos de partido...` });

                const deletePromises = [];
                for (const thread of matchThreads.values()) {
                    deletePromises.push(thread.delete('Limpieza de hilos de torneo.').catch(() => {}));
                }
                const results = await Promise.all(deletePromises);
                const deletedCount = results.length;

                if (torneoActivo) {
                    Object.values(torneoActivo.calendario).flat().forEach(p => p.threadId = null);
                    Object.keys(torneoActivo.eliminatorias).forEach(fase => {
                        if(Array.isArray(torneoActivo.eliminatorias[fase])) {
                        torneoActivo.eliminatorias[fase].forEach(p => p.threadId = null);
                        } else if (torneoActivo.eliminatorias[fase]?.threadId) {
                        torneoActivo.eliminatorias[fase].threadId = null;
                        }
                    });
                    saveBotState();
                }
                await interaction.followUp({ content: `✅ ${deletedCount} hilos de partido borrados.`, flags: [MessageFlags.Ephemeral] });

            } catch(error) {
                 console.error("Error al borrar hilos:", error);
                 await interaction.followUp({ content: `❌ Ocurrió un error al borrar los hilos.`, flags: [MessageFlags.Ephemeral] });
            } finally {
                const components = adminPanelMessage.components.map(row => ActionRowBuilder.from(row));
                components.forEach(row => row.components.forEach(button => button.setDisabled(false)));
                const readyEmbed = EmbedBuilder.from(adminPanelMessage.embeds[0]).setColor('#2c3e50').setFooter({ text: `ESTADO: ✅ LISTO PARA OPERAR\nÚltima acción: Borrado de hilos completado.` });
                await adminPanelMessage.edit({ embeds: [readyEmbed], components });
            }
            return;
        } 
    }

    else if (customId.startsWith('rules_')) {
        if(!isDeferred) await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [prefix, langCode, guildId] = customId.split('_');
        if (!langCode || !guildId) {
             return interaction.editReply({ content: 'Error: El botón que has pulsado es inválido o antiguo.' });
        }
        const roleInfo = Object.values(languageRoles).find(r => r.code === langCode);
        if (!roleInfo) {
            return interaction.editReply({ content: 'Error: Código de idioma inválido.' });
        }
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            return interaction.editReply({ content: 'Error: No he podido encontrar el servidor.' });
        }
        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) {
            return interaction.editReply({ content: 'Error: No pude encontrarte como miembro del servidor.' });
        }
        try {
            const rolesToRemove = member.roles.cache.filter(role => Object.values(languageRoles).some(lang => lang.name === role.name));
            if (rolesToRemove.size > 0) {
                await member.roles.remove(rolesToRemove, 'Cambiando rol de idioma');
            }
            const roleToAdd = guild.roles.cache.find(r => r.name === roleInfo.name);
            if (roleToAdd) {
                await member.roles.add(roleToAdd, 'Asignando rol de idioma por botón');
                await interaction.editReply({ content: `✅ ¡Idioma establecido a **${roleInfo.name}**!` });
            } else {
                await interaction.editReply({ content: `Error: El rol para ${roleInfo.name} no existe.` });
            }
        } catch (error) {
            console.error('Error al asignar rol de idioma desde botón:', error);
            await interaction.editReply({ content: 'Hubo un error al intentar asignarte el rol.' });
        }
    }

    else if (customId === 'inscribir_equipo_btn') {
        if (!torneoActivo || torneoActivo.status !== 'inscripcion_abierta') {
            return interaction.reply({ content: '🇪🇸 Las inscripciones no están abiertas.', flags: [MessageFlags.Ephemeral] });
        }
        const modal = new ModalBuilder().setCustomId('inscripcion_modal').setTitle('Inscripción de Equipo');
        const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre del equipo (3-15 caracteres)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(15).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput));
        return interaction.showModal(modal);
    } 
    
    else if (customId === 'pago_realizado_btn') {
        const modal = new ModalBuilder().setCustomId('pago_realizado_modal').setTitle('Confirmar Pago');
        const paypalInput = new TextInputBuilder().setCustomId('paypal_info_input').setLabel("Tu email o usuario de PayPal").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
        return interaction.showModal(modal);
    } 
    
    else if (customId.startsWith('reportar_resultado_v3_')) {
        const matchId = customId.replace('reportar_resultado_v3_', '');
        const { partido } = findMatch(matchId);
        if(!partido) return interaction.reply({content: "Error: No se pudo encontrar el partido.", flags: [MessageFlags.Ephemeral] });
        
        if (partido.status === 'finalizado') {
            return interaction.reply({content: "Este partido ya tiene un resultado final.", flags: [MessageFlags.Ephemeral] });
        }
        
        const modal = new ModalBuilder().setCustomId(`reportar_resultado_modal_${matchId}`).setTitle('Reportar Resultado');
        const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
        const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        return interaction.showModal(modal);
    }
    
    else if (customId.startsWith('upload_highlights_')) {
        const matchId = customId.replace('upload_highlights_', '');
        const modal = new ModalBuilder().setCustomId(`highlights_modal_${matchId}`).setTitle('Subir Alturas / Upload Highlights');
        const linkInput = new TextInputBuilder().setCustomId('highlight_link').setLabel("Enlace / Link").setStyle(TextInputStyle.Short).setRequired(true);
        const descriptionInput = new TextInputBuilder().setCustomId('highlight_desc').setLabel("Descripción (opcional)").setStyle(TextInputStyle.Paragraph).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(linkInput), new ActionRowBuilder().addComponents(descriptionInput));
        return interaction.showModal(modal);
    }

    else if (customId.startsWith('admin_modificar_resultado_')) {
        const hasPermission = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) || interaction.member.roles.cache.has(ARBITRO_ROLE_ID);
        if (!hasPermission) return interaction.reply({ content: 'No tienes permisos para usar este botón.', flags: [MessageFlags.Ephemeral] });

        const matchId = customId.replace('admin_modificar_resultado_', '');
        const { partido } = findMatch(matchId);
        if (!partido) return interaction.reply({ content: "Error: No se pudo encontrar el partido.", flags: [MessageFlags.Ephemeral] });
        const modal = new ModalBuilder().setCustomId(`admin_modificar_modal_${matchId}`).setTitle('Modificar Resultado (Admin/Árbitro)');
        const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[0] : '0');
        const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[1] : '0');
        modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        return interaction.showModal(modal);
    }
    
    else {
        if(!isDeferred) await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        if (customId.startsWith('solicitar_arbitraje_')) {
            const matchId = customId.replace('solicitar_arbitraje_', '');
            const { partido } = findMatch(matchId);
            if(!partido) return interaction.editReply({content: "🇪🇸 Error: No se pudo encontrar el partido." });
            if(partido.status !== 'finalizado') {
                partido.status = 'arbitraje';
                saveBotState();
                await updateMatchThreadName(partido);
                const arbitroRole = await interaction.guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);
                await interaction.channel.send({ content: `${arbitroRole ? arbitroRole.toString() : '@Árbitros'} 🇪🇸 Se ha solicitado arbitraje.`});
                return interaction.editReply({ content: '✅ Solicitud de arbitraje enviada.' });
            } else {
                return interaction.editReply({ content: `🇪🇸 No se puede solicitar arbitraje para un partido ya finalizado.`});
            }
        }
    
        if (customId.startsWith('admin_aprobar_') || customId.startsWith('admin_rechazar_') || customId.startsWith('admin_expulsar_')) {
            if (!torneoActivo) return interaction.editReply({ content: "Error: El torneo para esta acción ya no existe." });
            const [action, type, captainId] = customId.split('_');
            
            if (type === 'expulsar') {
                if (torneoActivo.status !== 'inscripcion_abierta') {
                    return interaction.editReply({ content: 'Solo se pueden expulsar equipos durante la fase de inscripción.' });
                }
                const teamToKick = torneoActivo.equipos_aprobados[captainId];
                if (!teamToKick) return interaction.editReply({ content: 'Error: No se pudo encontrar a este equipo.' });
    
                delete torneoActivo.equipos_aprobados[captainId];
                saveBotState();
                await actualizarNombresCanalesConIcono();
    
                const equiposChannel = await client.channels.fetch(torneoActivo.canalEquiposId).catch(() => null);
                 // --- CORRECCIÓN FINAL --- Leer el ID desde el objeto de torneo.
                if (equiposChannel && torneoActivo.listaEquiposMessageId) {
                    const listaMsg = await equiposChannel.messages.fetch(torneoActivo.listaEquiposMessageId).catch(() => null);
                    if(listaMsg) {
                        const nombresEquipos = Object.values(torneoActivo.equipos_aprobados).map((e, index) => `${index + 1}. ${e.bandera||''} ${e.nombre} (Capitán: ${e.capitanTag})`).join('\n');
                        const embedLista = EmbedBuilder.from(listaMsg.embeds[0]).setDescription(nombresEquipos || 'Aún no hay equipos inscritos.').setFooter({ text: `Total: ${Object.keys(torneoActivo.equipos_aprobados).length} / ${torneoActivo.size}` });
                        await listaMsg.edit({ embeds: [embedLista] });
                    }
                }
                const captainUser = await client.users.fetch(captainId).catch(() => null);
                if(captainUser) {
                    await captainUser.send(`🇪🇸 Tu equipo **${teamToKick.nombre}** ha sido eliminado del torneo.`).catch(() => {});
                }
                const originalMessage = interaction.message;
                const newEmbed = EmbedBuilder.from(originalMessage.embeds[0]).setTitle('❌ EQUIPO EXPULSADO').setColor('#E74C3C').setFooter({ text: `Expulsado por ${interaction.user.tag}`});
                const disabledButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('kicked_done').setLabel('Expulsado').setStyle(ButtonStyle.Danger).setDisabled(true));
                await originalMessage.edit({ embeds: [newEmbed], components: [disabledButtons] });
                await interaction.editReply({ content: `✅ El equipo **${teamToKick.nombre}** ha sido expulsado.` });
            } else {
                const equipoPendiente = torneoActivo.equipos_pendientes[captainId];
                if (!equipoPendiente) return interaction.editReply({ content: 'Este equipo ya no está pendiente.' });
                const originalMessage = interaction.message;
                const newEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
                const newButtons = new ActionRowBuilder();
                if (type === 'aprobar') {
                    if (Object.keys(torneoActivo.equipos_aprobados).length >= torneoActivo.size) {
                        return interaction.editReply({ content: 'El cupo de equipos ya está lleno.' });
                    }
                    if (!torneoActivo.equipos_aprobados) torneoActivo.equipos_aprobados = {};
                    equipoPendiente.id = captainId;
                    const captainMember = await interaction.guild.members.fetch(captainId).catch(()=>null);
                    let captainFlag = '🏳️';
                    if (captainMember) { for (const flag in languageRoles) { const role = interaction.guild.roles.cache.find(r => r.name === languageRoles[flag].name); if (role && captainMember.roles.cache.has(role.id)) { captainFlag = flag; break; } } }
                    equipoPendiente.bandera = captainFlag;
                    torneoActivo.equipos_aprobados[captainId] = equipoPendiente;
                    delete torneoActivo.equipos_pendientes[captainId];
                    saveBotState();
                    await actualizarNombresCanalesConIcono();
                    
                    if (captainMember) {
                        try {
                            const participanteRole = await interaction.guild.roles.fetch(PARTICIPANTE_ROLE_ID);
                            if (participanteRole) {
                                await captainMember.roles.add(participanteRole);
                            }
                        } catch (err) {
                            console.error(`[ERROR] No se pudo asignar el rol de participante a ${captainMember.user.tag}:`, err);
                        }
                    }
                    
                    newEmbed.setColor('#2ECC71').setTitle('✅ EQUIPO APROBADO').setFields({ name: 'Aprobado por', value: interaction.user.tag });
                    newButtons.addComponents(new ButtonBuilder().setCustomId(`admin_expulsar_${captainId}`).setLabel('Expulsar Equipo').setStyle(ButtonStyle.Danger).setEmoji('✖️'));
                    const captainUser = await client.users.fetch(captainId).catch(()=>null);
                    if(captainUser) {
                        await captainUser.send(`✅ ¡Tu inscripción para **${equipoPendiente.nombre}** ha sido aprobada!`).catch(()=>{});
                    }
                    await originalMessage.edit({ embeds: [newEmbed], components: [newButtons] });
                    await interaction.editReply({ content: `Acción 'aprobar' completada.` });

                    const equiposChannel = await client.channels.fetch(torneoActivo.canalEquiposId).catch(()=>null);
                    // --- CORRECCIÓN FINAL --- Leer el ID desde el objeto de torneo.
                    if (equiposChannel && torneoActivo.listaEquiposMessageId) {
                        const listaMsg = await equiposChannel.messages.fetch(torneoActivo.listaEquiposMessageId).catch(()=>null);
                        if(listaMsg) {
                            const nombresEquipos = Object.values(torneoActivo.equipos_aprobados).map((e, index) => `${index + 1}. ${e.bandera||''} ${e.nombre} (Capitán: ${e.capitanTag})`).join('\n');
                            const embedLista = EmbedBuilder.from(listaMsg.embeds[0]).setDescription(nombresEquipos || 'Aún no hay equipos inscritos.').setFooter({ text: `Total: ${Object.keys(torneoActivo.equipos_aprobados).length} / ${torneoActivo.size}` });
                            await listaMsg.edit({ embeds: [embedLista] });
                        }
                    }
                    if (Object.keys(torneoActivo.equipos_aprobados).length === torneoActivo.size) {
                        await interaction.followUp({ content: `¡Cupo de ${torneoActivo.size} equipos lleno! Iniciando sorteo...`, flags: [MessageFlags.Ephemeral] });
                        await realizarSorteoDeGrupos(interaction.guild);
                    }
                } else { // Rechazar
                    delete torneoActivo.equipos_pendientes[captainId];
                    saveBotState();
    
                    newEmbed.setColor('#e74c3c').setTitle('❌ INSCRIPCIÓN RECHAZADA').setFields({ name: 'Rechazado por', value: interaction.user.tag });
                    newButtons.addComponents(new ButtonBuilder().setCustomId('done_reject').setLabel('Rechazado').setStyle(ButtonStyle.Danger).setDisabled(true));
                    await originalMessage.edit({ embeds: [newEmbed], components: [newButtons] });
                    await interaction.editReply({ content: `Acción 'rechazar' completada.` });
                }
            }
        }
        
        if (customId.startsWith('admin_confirm_payment_')) {
            const winnerId = customId.split('_').pop();
            const winner = await client.users.fetch(winnerId).catch(() => null);
            if (!winner) {
                return interaction.editReply({ content: 'No se pudo encontrar al usuario ganador.' });
            }
            const dmEmbed = new EmbedBuilder().setColor('#2ECC71').setTitle('💸 ¡Premio Recibido!').setDescription(`🇪🇸 ¡Felicidades! El premio del torneo **${torneoActivo.nombre}** ha sido abonado.`);
            try {
                await winner.send({ embeds: [dmEmbed] });
            } catch (e) {
                return interaction.editReply({ content: `No se pudo enviar el DM al ganador, pero la acción se ha registrado.` });
            }
            const originalMessage = interaction.message;
            const newEmbed = EmbedBuilder.from(originalMessage.embeds[0]).setFooter({ text: `Pago confirmado por ${interaction.user.tag}`}).setColor('#1ABC9C');
            const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
            disabledRow.components.forEach(component => {
                if (component.customId === customId) {
                    component.setDisabled(true).setLabel('Pago Confirmado');
                }
            });
            await originalMessage.edit({ embeds: [newEmbed], components: [disabledRow] });
            await interaction.editReply({ content: `✅ Notificación de pago enviado correctamente al ganador.` });
        }
    }
}


async function handleSelectMenu(interaction) {
    if (interaction.customId === 'crear_torneo_format_select') {
        const formatId = interaction.values[0];
        const format = TOURNAMENT_FORMATS[formatId];
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId(`crear_torneo_type_select_${formatId}`)
            .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
            .addOptions([
                { label: 'De Pago', description: 'Se solicitará un pago para inscribirse.', value: 'pago' },
                { label: 'Gratuito', description: 'Inscripción gratuita.', value: 'gratis' },
            ]);
        const row = new ActionRowBuilder().addComponents(typeMenu);
        await interaction.update({ content: `Formato seleccionado: **${format.label}**. Ahora, selecciona el tipo:`, components: [row] });

    } else if (interaction.customId.startsWith('crear_torneo_type_select_')) {
        const formatId = interaction.customId.replace('crear_torneo_type_select_', '');
        const type = interaction.values[0];
        const modal = new ModalBuilder().setCustomId(`crear_torneo_final_${formatId}_${type}`).setTitle('Finalizar Creación de Torneo');
        const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(nombreInput));
        if (type === 'pago') {
            const paypalInput = new TextInputBuilder().setCustomId('torneo_paypal').setLabel("Enlace de PayPal.Me").setStyle(TextInputStyle.Short).setRequired(true);
            const prizeInputCampeon = new TextInputBuilder().setCustomId('torneo_prize_campeon').setLabel("Premio Campeón (€)").setStyle(TextInputStyle.Short).setRequired(true);
            const prizeInputFinalista = new TextInputBuilder().setCustomId('torneo_prize_finalista').setLabel("Premio Finalista (€)").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(
                new ActionRowBuilder().addComponents(paypalInput),
                new ActionRowBuilder().addComponents(prizeInputCampeon),
                new ActionRowBuilder().addComponents(prizeInputFinalista)
            );
        }
        await interaction.showModal(modal);
    }
}

async function handleModalSubmit(interaction) {
    const { customId, fields } = interaction;
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    if (customId.startsWith('crear_torneo_final_')) {
        try {
            if (torneoActivo) {
                return interaction.editReply({ content: '❌ Ya hay un torneo activo.' });
            }

            const match = customId.match(/crear_torneo_final_(.+)_(pago|gratis)/);
            if (!match) {
                 return interaction.editReply({ content: 'Error: `customId` inválido.' });
            }
            const [, formatId, type] = match;
            
            const format = TOURNAMENT_FORMATS[formatId];
            if (!format) {
                return interaction.editReply({ content: 'Error: Formato de torneo inválido.' });
            }

            const isPaid = type === 'pago';
            const nombre = fields.getTextInputValue('torneo_nombre');
            
            let enlacePaypal = null;
            let prizeCampeon = 0;
            let prizeFinalista = 0;

            if (isPaid) {
                enlacePaypal = fields.getTextInputValue('torneo_paypal');
                prizeCampeon = parseFloat(fields.getTextInputValue('torneo_prize_campeon'));
                prizeFinalista = parseFloat(fields.getTextInputValue('torneo_prize_finalista'));
                if (!enlacePaypal || isNaN(prizeCampeon) || isNaN(prizeFinalista)) {
                    return interaction.editReply({ content: 'Debes proporcionar un enlace de PayPal y premios válidos.' });
                }
            }
            
            await interaction.editReply({ content: `✅ Recibido. Creando torneo "${nombre}"...` });

            await Promise.all([
                limpiarCanal(INSCRIPCION_CHANNEL_ID),
                limpiarCanal(EQUIPOS_INSCRITOS_CHANNEL_ID),
                limpiarCanal(CLASIFICACION_CHANNEL_ID),
                limpiarCanal(CALENDARIO_JORNADAS_CHANNEL_ID)
            ]);
            
            torneoActivo = { 
                nombre, 
                formatId: formatId,
                size: format.size,
                isPaid, prizeCampeon, prizeFinalista, 
                status: 'inscripcion_abierta', 
                enlace_paypal: enlacePaypal, 
                equipos_pendientes: {}, 
                equipos_aprobados: {}, 
                canalEquiposId: EQUIPOS_INSCRITOS_CHANNEL_ID,
                canalGruposId: CLASIFICACION_CHANNEL_ID,
                // --- ARQUITECTURA --- Los IDs ahora viven aquí
                publicGroupsMessageId: null, 
                calendarioMessageId: null,
                mensajeInscripcionId: null, 
                listaEquiposMessageId: null,
                calendario: {}, 
                grupos: {}, 
                eliminatorias: {} 
            };
            
            let prizeText = isPaid ? `**Premio Campeón:** ${prizeCampeon}€\n**Premio Finalista:** ${prizeFinalista}€` : '**Precio:** Gratis';
            const embed = new EmbedBuilder().setColor('#5865F2').setTitle(`🏆 Inscripciones Abiertas: ${nombre}`).setDescription(`Para participar, haz clic abajo.\n\n${prizeText}\n\n**Formato:** ${format.label}\n**Límite:** ${torneoActivo.size} equipos.`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('inscribir_equipo_btn').setLabel('Inscribir Equipo').setStyle(ButtonStyle.Success).setEmoji('📝'));
            const newMessage = await client.channels.cache.get(INSCRIPCION_CHANNEL_ID).send({ embeds: [embed], components: [row] });
            
            // --- CORRECCIÓN FINAL --- Guardar el ID en el objeto torneo y en la variable de acceso rápido.
            torneoActivo.mensajeInscripcionId = newMessage.id;
            mensajeInscripcionId = newMessage.id;

            const embedLista = new EmbedBuilder().setColor('#3498db').setTitle(`Equipos Inscritos - ${nombre}`).setDescription('Aún no hay equipos inscritos.').setFooter({ text: `Total: 0 / ${torneoActivo.size}` });
            const listaMsg = await client.channels.cache.get(EQUIPOS_INSCRITOS_CHANNEL_ID).send({ embeds: [embedLista] });

            // --- CORRECCIÓN FINAL --- Guardar el ID en el objeto torneo y en la variable de acceso rápido.
            torneoActivo.listaEquiposMessageId = listaMsg.id;
            listaEquiposMessageId = listaMsg.id;
            
            const calendarioChannel = await client.channels.fetch(CALENDARIO_JORNADAS_CHANNEL_ID).catch(()=>null);
            if (calendarioChannel) {
                const embedCalendario = new EmbedBuilder().setColor('#9b59b6').setTitle(`🗓️ Calendario de Jornadas - ${nombre}`).setDescription('El calendario se mostrará aquí una vez realizado el sorteo.');
                const calendarioMsg = await calendarioChannel.send({ embeds: [embedCalendario] });
                torneoActivo.calendarioMessageId = calendarioMsg.id;
            }

            saveBotState();
            await actualizarNombresCanalesConIcono();
            
            await interaction.followUp({ content: `✅ Torneo "${nombre}" creado con éxito.`, flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            console.error("Error crítico al crear el torneo:", error);
            torneoActivo = null; 
            saveBotState();
            await interaction.followUp({ content: '❌ Ocurrió un error inesperado al crear el torneo.', flags: [MessageFlags.Ephemeral] });
        }
    } 
    
    else if (customId === 'inscripcion_modal') {
        if (!torneoActivo) {
            return interaction.editReply({ content: '❌ No hay un torneo activo.' });
        }
        const teamName = fields.getTextInputValue('nombre_equipo_input');

        if (teamName.length < 3 || teamName.length > 15) {
            return interaction.editReply({ content: '🇪🇸 El nombre debe tener entre 3 y 15 caracteres.' });
        }

        const allTeamNames = [
            ...Object.values(torneoActivo.equipos_aprobados || {}).map(e => e.nombre.toLowerCase()),
            ...Object.values(torneoActivo.equipos_pendientes || {}).map(e => e.nombre.toLowerCase())
        ];

        if (allTeamNames.includes(teamName.toLowerCase())) {
            return interaction.editReply({ content: '🇪🇸 Ya existe un equipo con este nombre.' });
        }

        if (torneoActivo.status !== 'inscripcion_abierta') return interaction.editReply('🇪🇸 Las inscripciones no están abiertas.');
        if (Object.keys(torneoActivo.equipos_aprobados || {}).length >= torneoActivo.size) return interaction.editReply('🇪🇸 El cupo está lleno.');
        if ((torneoActivo.equipos_pendientes || {})[interaction.user.id] || (torneoActivo.equipos_aprobados || {})[interaction.user.id]) return interaction.editReply('🇪🇸 Ya estás inscrito.');
        
        torneoActivo.equipos_pendientes[interaction.user.id] = { nombre: teamName, capitanTag: interaction.user.tag, capitanId: interaction.user.id };
        saveBotState();

        if (torneoActivo.isPaid) {
            const embed = new EmbedBuilder().setColor('#f1c40f').setTitle('🇪🇸 Inscripción Recibida - Pendiente de Pago').addFields({ name: 'Enlace de Pago', value: torneoActivo.enlace_paypal }, { name: 'Siguiente Paso', value: "Cuando hayas pagado, haz clic abajo." });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pago_realizado_btn').setLabel('✅ He Realizado el Pago').setStyle(ButtonStyle.Success));
            try {
                await interaction.user.send({ embeds: [embed], components: [row] });
                await interaction.editReply({ content: '✅ ¡Revisa tus DMs para las instrucciones de pago!' });
            } catch {
                await interaction.editReply({ content: '❌ No pude enviarte un DM.' });
            }
        } else {
            const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
            if (adminChannel) {
                const adminEmbed = new EmbedBuilder().setColor('#3498DB').setTitle('🔔 Nueva Inscripción (Gratis)').addFields({ name: 'Equipo', value: teamName, inline: true }, { name: 'Capitán', value: interaction.user.tag, inline: true });
                const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_aprobar_${interaction.user.id}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin_rechazar_${interaction.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
                await adminChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
            }
            await interaction.editReply({ content: '✅ ¡Inscripción recibida! Un admin aprobará tu equipo.' });
        }

    } else if (customId === 'pago_realizado_modal') {
        if (!torneoActivo) {
            return interaction.editReply({ content: '❌ Error: El torneo ya no existe.' });
        }
        const paypalInfo = fields.getTextInputValue('paypal_info_input');
        const pendingTeamData = (torneoActivo.equipos_pendientes || {})[interaction.user.id];
        if (!pendingTeamData) return interaction.editReply({ content: '🇪🇸 No encontré tu inscripción pendiente.' });

        pendingTeamData.paypal = paypalInfo;
        saveBotState();

        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
        if (adminChannel) {
            const adminEmbed = new EmbedBuilder().setColor('#e67e22').setTitle('🔔 Notificación de Pago').addFields({ name: 'Equipo', value: pendingTeamData.nombre, inline: true }, { name: 'Capitán', value: interaction.user.tag, inline: true }, { name: 'PayPal Indicado', value: `\`${paypalInfo}\``, inline: false });
            const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_aprobar_${interaction.user.id}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`admin_rechazar_${interaction.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
            await adminChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
        }
        await interaction.editReply({ content: '✅ ¡Gracias! Un administrador ha sido notificado.' });
    } 
    
    else if (customId === 'add_test_modal') {
        if (!torneoActivo) {
            return interaction.editReply('Error: Primero crea un torneo.');
        }
        const cantidad = parseInt(fields.getTextInputValue('cantidad_input'));
        if (isNaN(cantidad) || cantidad <= 0) return interaction.editReply('Número inválido.');
        
        await interaction.editReply(`✅ Recibido. Añadiendo ${cantidad} equipos de prueba...`);

        const adminMember = interaction.member;
        let adminFlag = '🧪'; 
        for (const flag in languageRoles) {
            const role = interaction.guild.roles.cache.find(r => r.name === languageRoles[flag].name);
            if (role && adminMember.roles.cache.has(role.id)) {
                adminFlag = flag;
                break;
            }
        }

        const capitanDePruebaId = interaction.user.id;
        const capitanDePruebaTag = interaction.user.tag;
        const initialCount = Object.keys(torneoActivo.equipos_aprobados).length;
        for (let i = 0; i < cantidad; i++) {
            if(Object.keys(torneoActivo.equipos_aprobados).length >= torneoActivo.size) break;
            const teamId = `prueba_${Date.now()}_${i}`;
            const nombreEquipo = `E-Prueba-${initialCount + i + 1}`;
            torneoActivo.equipos_aprobados[teamId] = { id: teamId, nombre: nombreEquipo, capitanId: capitanDePruebaId, capitanTag: capitanDePruebaTag, bandera: adminFlag, paypal: 'admin@test.com' };
        }
        saveBotState();

        await actualizarNombresCanalesConIcono();
        
        const equiposChannel = await client.channels.fetch(torneoActivo.canalEquiposId).catch(() => null);
        // --- CORRECCIÓN FINAL --- Leer el ID desde el objeto de torneo, que ahora es fiable.
        if (equiposChannel && torneoActivo.listaEquiposMessageId) {
             const listaMsg = await equiposChannel.messages.fetch(torneoActivo.listaEquiposMessageId).catch(()=>null);
             if(listaMsg) {
                const nombresEquipos = Object.values(torneoActivo.equipos_aprobados).map((e, i) => `${i + 1}. ${e.bandera||''} ${e.nombre} (Capi: ${e.capitanTag})`).join('\n');
                const embedLista = EmbedBuilder.from(listaMsg.embeds[0]).setDescription(nombresEquipos).setFooter({ text: `Total: ${Object.keys(torneoActivo.equipos_aprobados).length} / ${torneoActivo.size}` });
                await listaMsg.edit({ embeds: [embedLista] });
             }
        }
        await interaction.followUp({ content: '✅ Interfaz actualizada.', flags: [MessageFlags.Ephemeral] });

    } 
    
    else if (customId.startsWith('reportar_resultado_modal_')) {
        if (!torneoActivo) {
            return interaction.editReply({ content: '❌ El torneo ya no existe.' });
        }
        const matchId = customId.replace('reportar_resultado_modal_', '');
        const golesA = parseInt(fields.getTextInputValue('goles_a'));
        const golesB = parseInt(fields.getTextInputValue('goles_b'));

        if (isNaN(golesA) || isNaN(golesB)) {
            return interaction.editReply("🇪🇸 Formato de resultado inválido.");
        }
        const { partido } = findMatch(matchId);
        if (!partido) {
            return interaction.editReply("🇪🇸 Error: Partido no encontrado.");
        }
        if (partido.resultado) {
            return interaction.editReply("🇪🇸 Este partido ya tiene un resultado.");
        }

        if (partido.equipoA.capitanId === partido.equipoB.capitanId) {
            partido.resultado = `${golesA}-${golesB}`;
            partido.status = 'finalizado';
            await interaction.editReply(`✅ Resultado ${partido.resultado} confirmado (modo prueba).`);
            await procesarResultadoFinal(partido, interaction);
            return;
        }

        if (!partido.reportedScores) partido.reportedScores = {};
        partido.reportedScores[interaction.user.id] = { golesA, golesB };
        const otherCaptainId = interaction.user.id === partido.equipoA.capitanId ? partido.equipoB.capitanId : partido.equipoA.capitanId;
        const otherCaptainResult = partido.reportedScores[otherCaptainId];

        if (otherCaptainResult) {
            if (otherCaptainResult.golesA === golesA && otherCaptainResult.golesB === golesB) {
                partido.resultado = `${golesA}-${golesB}`;
                partido.status = 'finalizado';
                await interaction.editReply(`✅ Resultado ${partido.resultado} confirmado por ambos capitanes.`);
                await procesarResultadoFinal(partido, interaction);
            } else {
                partido.reportedScores = {};
                await interaction.channel.send({ content: `**⚠️ ¡Conflicto de resultados!** Los marcadores no coinciden. Por favor, volved a reportar.`});
                await interaction.editReply({ content: `❌ Los resultados no coinciden.` });
            }
        } else {
            await interaction.editReply(`✅ Tu resultado (${golesA}-${golesB}) ha sido guardado. Esperando al otro capitán.`);
        }
        saveBotState();

    } 
    
    else if (customId.startsWith('admin_modificar_modal_')) {
        if (!torneoActivo) {
            return interaction.editReply({ content: '❌ El torneo ya no existe.' });
        }
        const matchId = customId.replace('admin_modificar_modal_', '');
        const golesA = parseInt(fields.getTextInputValue('goles_a'));
        const golesB = parseInt(fields.getTextInputValue('goles_b'));

        if (isNaN(golesA) || isNaN(golesB)) {
            return interaction.editReply("🇪🇸 Formato de resultado inválido.");
        }
        const { partido } = findMatch(matchId);
        if (!partido) {
            return interaction.editReply("🇪🇸 Error: Partido no encontrado.");
        }
        
        const oldResult = partido.resultado;
        if (oldResult) {
           await revertirEstadisticas(partido, oldResult);
        }

        partido.resultado = `${golesA}-${golesB}`;
        if (partido.status !== 'finalizado') {
            partido.status = 'finalizado';
        }
        await interaction.editReply(`✅ Resultado modificado por ${interaction.user.tag} a ${partido.resultado}.`);
        await procesarResultadoFinal(partido, interaction);
    
    } 
    
    else if (customId.startsWith('highlights_modal_')) {
        if (!torneoActivo) {
            return interaction.editReply({ content: '❌ El torneo ya no existe.' });
        }
        const link = fields.getTextInputValue('highlight_link');
        const description = fields.getTextInputValue('highlight_desc');

        const embed = new EmbedBuilder()
            .setColor('#7289DA')
            .setAuthor({ name: `Alturas compartidas por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTitle('🎬 ¡Nuevas Alturas!')
            .setDescription(`**[Ver Clip](${link})**\n\n${description || 'Sin descripción'}`)
            .setTimestamp();
        
        try {
            await interaction.channel.send({ embeds: [embed] });
            await interaction.editReply({ content: '✅ ¡Tus alturas han sido compartidas!' });
        } catch (e) {
            await interaction.editReply({ content: "❌ Hubo un error al enviar el mensaje."});
        }
    }
}
// ... (mismas funciones a partir de aquí)
async function procesarResultadoFinal(partido, interaction, fromSimulation = false) {
    await updateMatchThreadName(partido);
    if (partido.nombreGrupo) {
        await actualizarEstadisticasYClasificacion(partido, partido.nombreGrupo, interaction.guild);
    } else {
        await procesarResultadoEliminatoria(interaction.guild);
    }
    
    await actualizarMensajeCalendario();

    if (!fromSimulation) {
        const thread = await client.channels.fetch(partido.threadId).catch(() => null);
        if (thread) {
            await thread.send({ content: `✅ Resultado final: **${partido.equipoA.nombre} ${partido.resultado} ${partido.equipoB.nombre}**.`});
        }
    }
}

function findMatch(matchId, all = false) {
    if (!torneoActivo) return { partido: null };
    const allMatches = [
        ...(Object.values(torneoActivo.calendario || {}).flat()),
        ...(torneoActivo.eliminatorias?.octavos || []),
        ...(torneoActivo.eliminatorias?.cuartos || []),
        ...(torneoActivo.eliminatorias?.semifinales || []),
        ...(torneoActivo.eliminatorias?.final ? [torneoActivo.eliminatorias.final] : [])
    ].filter(Boolean);

    if (all) return allMatches;
    
    const partido = allMatches.find(p => p && p.matchId === matchId);
    return { partido: partido || null };
}

async function realizarSorteoDeGrupos(guild) {
    const torneo = torneoActivo;
    const format = TOURNAMENT_FORMATS[torneo.formatId];
    if (!format) {
        return;
    }

    const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!adminChannel) { return; }

    await adminChannel.send('Iniciando sorteo...');
    
    const inscripcionChannel = await client.channels.fetch(INSCRIPCION_CHANNEL_ID);
    // --- CORRECCIÓN FINAL --- Leer el ID desde el objeto de torneo.
    if(torneo.mensajeInscripcionId) {
        try {
            const msg = await inscripcionChannel.messages.fetch(torneo.mensajeInscripcionId);
            const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(msg.components[0].components[0]).setDisabled(true));
            await msg.edit({ content: 'Las inscripciones para este torneo han finalizado.', components: [disabledRow] });
        } catch (e) { console.error("No se pudo editar el mensaje de inscripción."); }
    }
    torneo.status = 'fase_de_grupos';
    let equipos = Object.values(torneo.equipos_aprobados);
    for (let i = equipos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [equipos[i], equipos[j]] = [equipos[j], equipos[i]]; }
    const grupos = {};
    const calendario = {};

    const numGrupos = format.groups;
    const tamanoGrupo = format.size / numGrupos;

    for (let i = 0; i < equipos.length; i++) {
        const grupoIndex = Math.floor(i / tamanoGrupo);
        const nombreGrupo = `Grupo ${String.fromCharCode(65 + grupoIndex)}`;
        if (!grupos[nombreGrupo]) grupos[nombreGrupo] = { equipos: [] };
        equipos[i].stats = { pj: 0, pts: 0, gf: 0, gc: 0, dg: 0 };
        grupos[nombreGrupo].equipos.push(equipos[i]);
    }

    for (const nombreGrupo in grupos) {
        const equiposGrupo = grupos[nombreGrupo].equipos;
        calendario[nombreGrupo] = [];
        if (equiposGrupo.length === 4) {
            const [team1, team2, team3, team4] = equiposGrupo;
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 1, team1, team2), createMatchObject(nombreGrupo, 1, team3, team4));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 2, team1, team3), createMatchObject(nombreGrupo, 2, team2, team4));
            calendario[nombreGrupo].push(createMatchObject(nombreGrupo, 3, team1, team4), createMatchObject(nombreGrupo, 3, team2, team3));
        }
    }
    
    torneo.grupos = grupos;
    torneo.calendario = calendario;
    torneo.eliminatorias = { rondaActual: null, octavos: [], cuartos: [], semifinales: [], final: null };

    const gruposChannel = await client.channels.fetch(CLASIFICACION_CHANNEL_ID).catch(() => null);
     if (!gruposChannel) {
        await adminChannel.send(`❌ Error Crítico: No se pudo encontrar el canal de clasificación.`);
        return;
    }
    await limpiarCanal(CLASIFICACION_CHANNEL_ID);

    torneo.canalGruposId = CLASIFICACION_CHANNEL_ID;
    const embedClasificacion = new EmbedBuilder().setColor('#1abc9c').setTitle(`Clasificación: ${torneo.nombre}`).setDescription('¡Mucha suerte a todos!').setTimestamp();
    const classificationMessage = await gruposChannel.send({ embeds: [embedClasificacion] });
    torneo.publicGroupsMessageId = classificationMessage.id;
    
    await actualizarMensajeClasificacion();
    await actualizarMensajeCalendario();
    await actualizarNombresCanalesConIcono();
    
    let createdCount = 0;
    for (const nombreGrupo in calendario) {
        const partidosJornada1 = calendario[nombreGrupo].filter(p => p.jornada === 1);
        for (const partido of partidosJornada1) {
            await crearHiloDePartido(guild, partido, `Grupo ${nombreGrupo.slice(-1)}`);
            createdCount++;
        }
    }
    saveBotState();
    await adminChannel.send(`✅ Sorteo completado y ${createdCount} hilos de Jornada 1 creados.`);
}

async function verificarYCrearSiguientesHilos(guild) {
    if (!torneoActivo || torneoActivo.status !== 'fase_de_grupos') return;

    for (const groupName in torneoActivo.calendario) {
        const partidosPendientes = torneoActivo.calendario[groupName].filter(p => p.jornada > 1 && !p.threadId);
        if(partidosPendientes.length === 0) continue;

        const primeraJornadaPendiente = Math.min(...partidosPendientes.map(p => p.jornada));
        const partidosJornadaAnterior = torneoActivo.calendario[groupName].filter(p => p.jornada === primeraJornadaPendiente - 1);
        
        if (partidosJornadaAnterior.length > 0 && partidosJornadaAnterior.every(p => p.status === 'finalizado')) {
             const partidosACrear = torneoActivo.calendario[groupName].filter(p => p.jornada === primeraJornadaPendiente);
             for(const partido of partidosACrear) {
                if(!partido.threadId) {
                    await crearHiloDePartido(guild, partido, `Grupo ${groupName.slice(-1)}`);
                }
             }
        }
    }
    saveBotState();
}

function crearPartidosEliminatoria(equipos, ronda) {
    let partidos = [];
    for (let i = equipos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [equipos[i], equipos[j]] = [equipos[j], equipos[i]];
    }

    for(let i = 0; i < equipos.length; i += 2) {
        const equipoA = equipos[i];
        const equipoB = equipos[i+1];
        if (!equipoA || !equipoB) continue;
        const partido = {
            matchId: `match_${ronda}_${i/2}_${Date.now()}`,
            equipoA,
            equipoB,
            resultado: null,
            reportedScores: {},
            status: 'en_curso',
            nombreGrupo: null,
            ronda: ronda
        };
        partidos.push(partido);
    }
    return partidos;
}

async function iniciarFaseEliminatoria(guild) {
    if (!torneoActivo || torneoActivo.status !== 'fase_de_grupos') return;

    let todosPartidosFinalizados = Object.values(torneoActivo.calendario).flat().every(p => p.status === 'finalizado');
    if (!todosPartidosFinalizados) return;

    const format = TOURNAMENT_FORMATS[torneoActivo.formatId];
    if (!format || format.knockoutStages.length === 0) return;

    const primeraRonda = format.knockoutStages[0];
    torneoActivo.status = primeraRonda;
    torneoActivo.eliminatorias.rondaActual = primeraRonda;
    await actualizarNombresCanalesConIcono();

    const clasificados = [];
    const gruposOrdenados = Object.keys(torneoActivo.grupos).sort();

    for (const groupName of gruposOrdenados) {
        const grupoOrdenado = [...torneoActivo.grupos[groupName].equipos].sort((a,b) => sortTeams(a,b,groupName));
        const clasificadosDelGrupo = grupoOrdenado.slice(0, format.qualifiersPerGroup);
        const clasificadosReales = clasificadosDelGrupo.map(c => JSON.parse(JSON.stringify(c)));
        clasificados.push(...clasificadosReales);
    }
    
    const partidos = crearPartidosEliminatoria(clasificados, primeraRonda);
    if (primeraRonda === 'final') {
        torneoActivo.eliminatorias.final = partidos[0];
    } else {
        torneoActivo.eliminatorias[primeraRonda] = partidos;
    }

    const clasifChannel = await client.channels.fetch(torneoActivo.canalGruposId).catch(() => null);
    const embedAnuncio = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle(`🔥 ¡Comienza la Fase Eliminatoria: ${primeraRonda.charAt(0).toUpperCase() + primeraRonda.slice(1)}! 🔥`)
        .setFooter({text: '¡Mucha suerte a los clasificados!'});

    for(let i = 0; i < partidos.length; i++) {
        const p = partidos[i];
        await crearHiloDePartido(guild, p, `${primeraRonda.charAt(0).toUpperCase() + primeraRonda.slice(1)}-${i+1}`);
        embedAnuncio.addFields({ name: `Partido ${i+1}`, value: `> ${p.equipoA.nombre} vs ${p.equipoB.nombre}` });
    }
    
    if (clasifChannel) {
        await clasifChannel.send({ embeds: [embedAnuncio] });
    }
    
    saveBotState();
}

async function procesarResultadoEliminatoria(guild) {
    if (!torneoActivo) return;
    const rondaActual = torneoActivo.eliminatorias.rondaActual;
    if (!rondaActual) return;

    if (rondaActual === 'final' && torneoActivo.eliminatorias.final?.status === 'finalizado') {
        await handleFinalResult();
        return;
    }

    const partidosRonda = torneoActivo.eliminatorias[rondaActual];
    if (!partidosRonda || !partidosRonda.every(p => p.status === 'finalizado')) {
        return;
    }

    const format = TOURNAMENT_FORMATS[torneoActivo.formatId];
    const indiceRondaActual = format.knockoutStages.indexOf(rondaActual);
    const siguienteRonda = format.knockoutStages[indiceRondaActual + 1];

    if (!siguienteRonda) {
        return;
    }
    
    torneoActivo.status = siguienteRonda;
    torneoActivo.eliminatorias.rondaActual = siguienteRonda;
    await actualizarNombresCanalesConIcono();

    const ganadores = partidosRonda.map(p => {
        const [golesA, golesB] = p.resultado.split('-').map(Number);
        const equipoGanador = golesA > golesB ? p.equipoA : p.equipoB;
        return JSON.parse(JSON.stringify(equipoGanador));
    });

    const partidos = crearPartidosEliminatoria(ganadores, siguienteRonda);
    
    if (siguienteRonda === 'final') {
        torneoActivo.eliminatorias.final = partidos[0];
    } else {
        torneoActivo.eliminatorias[siguienteRonda] = partidos;
    }
    
    const clasifChannel = await client.channels.fetch(torneoActivo.canalGruposId).catch(() => null);
    const embedAnuncio = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`🏆 ¡Avanzamos a: ${siguienteRonda.charAt(0).toUpperCase() + siguienteRonda.slice(1)}! 🏆`)
        .setFooter({text: '¡La tensión aumenta!'});

    for(let i = 0; i < partidos.length; i++) {
        const p = partidos[i];
        await crearHiloDePartido(guild, p, `${siguienteRonda.charAt(0).toUpperCase() + siguienteRonda.slice(1)}-${i+1}`);
        embedAnuncio.addFields({ name: `Partido ${i+1}`, value: `> ${p.equipoA.nombre} vs ${p.equipoB.nombre}` });
    }

    if(clasifChannel) {
        await clasifChannel.send({ embeds: [embedAnuncio] });
    }
    saveBotState();
}

async function handleFinalResult() {
    if (!torneoActivo || !torneoActivo.eliminatorias.final || torneoActivo.status === 'terminado') return;

    const final = torneoActivo.eliminatorias.final;
    const [golesA, golesB] = final.resultado.split('-').map(Number);
    const campeon = golesA > golesB ? final.equipoA : final.equipoB;
    const finalista = golesA > golesB ? final.equipoB : final.equipoA;
    torneoActivo.status = 'terminado';
    saveBotState();

    const embedCampeon = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle(`🎉 ¡Tenemos un Campeón! 🎉`)
        .setDescription(`**¡Felicidades a ${campeon.nombre} por ganar el torneo ${torneoActivo.nombre}!**`)
        .setThumbnail('https://i.imgur.com/C5mJg1s.png')
        .setTimestamp();

    const clasifChannel = await client.channels.fetch(torneoActivo.canalGruposId).catch(() => null);
    if(clasifChannel) {
        await clasifChannel.send({ content: `|| @everyone ||`, embeds: [embedCampeon] });
    }
    
    await actualizarNombresCanalesConIcono();

    if (torneoActivo.isPaid) {
        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
        if(adminChannel) {
            const paymentEmbedCampeon = new EmbedBuilder().setColor('#FFD700').setTitle('🏆 Tarea: Pagar Premio CAMPEÓN').addFields({ name: 'Ganador', value: campeon.nombre },{ name: 'Capitán', value: campeon.capitanTag },{ name: 'PayPal', value: `\`${campeon.paypal || 'N/A'}\`` },{ name: 'Monto', value: `${torneoActivo.prizeCampeon}€` });
            const rowCampeon = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_confirm_payment_campeon_${campeon.id}`).setLabel('Confirmar Pago Campeón').setStyle(ButtonStyle.Success));
            if (campeon.paypal) { rowCampeon.addComponents(new ButtonBuilder().setLabel('Pagar').setStyle(ButtonStyle.Link).setURL(`https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(campeon.paypal)}&amount=${torneoActivo.prizeCampeon}¤cy_code=EUR`)); }
            await adminChannel.send({ content: `<@&${ARBITRO_ROLE_ID}>`, embeds: [paymentEmbedCampeon], components: [rowCampeon] });
            
            const paymentEmbedFinalista = new EmbedBuilder().setColor('#C0C0C0').setTitle('🥈 Tarea: Pagar Premio FINALISTA').addFields({ name: 'Finalista', value: finalista.nombre },{ name: 'Capitán', value: finalista.capitanTag },{ name: 'PayPal', value: `\`${finalista.paypal || 'N/A'}\`` },{ name: 'Monto', value: `${torneoActivo.prizeFinalista}€` });
            const rowFinalista = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_confirm_payment_finalista_${finalista.id}`).setLabel('Confirmar Pago Finalista').setStyle(ButtonStyle.Success));
             if (finalista.paypal) { rowFinalista.addComponents(new ButtonBuilder().setLabel('Pagar').setStyle(ButtonStyle.Link).setURL(`https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(finalista.paypal)}&amount=${torneoActivo.prizeFinalista}¤cy_code=EUR`)); }
            await adminChannel.send({ embeds: [paymentEmbedFinalista], components: [rowFinalista] });
        }
    }
}

async function revertirEstadisticas(partido, oldResult) {
    if (!partido.nombreGrupo) return;

    const [oldGolesA, oldGolesB] = oldResult.split('-').map(Number);
    const equipoA = torneoActivo.grupos[partido.nombreGrupo].equipos.find(e => e.id === partido.equipoA.id);
    const equipoB = torneoActivo.grupos[partido.nombreGrupo].equipos.find(e => e.id === partido.equipoB.id);

    if (!equipoA || !equipoB) return;

    equipoA.stats.pj -= 1;
    equipoB.stats.pj -= 1;
    equipoA.stats.gf -= oldGolesA;
    equipoB.stats.gf -= oldGolesB;
    equipoA.stats.gc -= oldGolesB;
    equipoB.stats.gc -= oldGolesA;

    if (oldGolesA > oldGolesB) equipoA.stats.pts -= 3;
    else if (oldGolesB > oldGolesA) equipoB.stats.pts -= 3;
    else { equipoA.stats.pts -= 1; equipoB.stats.pts -= 1; }
}

async function actualizarEstadisticasYClasificacion(partido, nombreGrupo, guild) {
    const [golesA, golesB] = partido.resultado.split('-').map(Number);
    const equipoA = torneoActivo.grupos[nombreGrupo].equipos.find(e => e.id === partido.equipoA.id);
    const equipoB = torneoActivo.grupos[nombreGrupo].equipos.find(e => e.id === partido.equipoB.id);

    if (!equipoA || !equipoB) return;

    equipoA.stats.pj += 1;
    equipoB.stats.pj += 1;
    equipoA.stats.gf += golesA;
    equipoB.stats.gf += golesB;
    equipoA.stats.gc += golesB;
    equipoB.stats.gc += golesA;
    equipoA.stats.dg = equipoA.stats.gf - equipoA.stats.gc;
    equipoB.stats.dg = equipoB.stats.gf - equipoB.stats.gc;

    if (golesA > golesB) equipoA.stats.pts += 3;
    else if (golesB > golesA) equipoB.stats.pts += 3;
    else { equipoA.stats.pts += 1; equipoB.stats.pts += 1; }
    
    saveBotState();

    await actualizarMensajeClasificacion();
    await verificarYCrearSiguientesHilos(guild);
    await iniciarFaseEliminatoria(guild);
}

function sortTeams(a, b, groupName) {
    if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
    if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
    if (a.stats.gf !== b.stats.gf) return b.stats.gf - a.stats.gf;

    const enfrentamiento = torneoActivo.calendario[groupName].find(p => (p.equipoA.id === a.id && p.equipoB.id === b.id) || (p.equipoA.id === b.id && p.equipoB.id === a.id));
    if (enfrentamiento && enfrentamiento.resultado) {
        const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
        if (enfrentamiento.equipoA.id === a.id) { if (golesA > golesB) return -1; if (golesB > golesA) return 1; }
        else { if (golesB > golesA) return -1; if (golesA > golesB) return 1; }
    }
    return 0;
}

async function actualizarMensajeClasificacion() {
    if (!torneoActivo || !torneoActivo.canalGruposId || !torneoActivo.publicGroupsMessageId) return;
    const channel = await client.channels.fetch(torneoActivo.canalGruposId).catch(() => null);
    if (!channel) return;
    const message = await channel.messages.fetch(torneoActivo.publicGroupsMessageId).catch(() => null);
    if (!message) return;
    const newEmbed = EmbedBuilder.from(message.embeds[0]);
    newEmbed.setFields([]);

    for (const groupName in torneoActivo.grupos) {
        const grupo = torneoActivo.grupos[groupName];
        const equiposOrdenados = [...grupo.equipos].sort((a,b) => sortTeams(a,b,groupName));

        const nameWidth = 16;
        const header = "EQUIPO".padEnd(nameWidth) + "PJ  PTS  GF  GC   DG";

        const table = equiposOrdenados.map(e => {
            const teamName = e.nombre.slice(0, nameWidth - 1).padEnd(nameWidth);
            const pj = e.stats.pj.toString().padStart(2);
            const pts = e.stats.pts.toString().padStart(3);
            const gf = e.stats.gf.toString().padStart(3);
            const gc = e.stats.gc.toString().padStart(3);
            const dgVal = e.stats.dg;
            const dg = (dgVal >= 0 ? '+' : '') + dgVal.toString();
            const paddedDg = dg.padStart(4);
            return `${teamName}${pj}  ${pts}  ${gf}  ${gc}  ${paddedDg}`;
        }).join('\n');

        newEmbed.addFields({ name: `**${groupName}**`, value: "```\n" + header + "\n" + table + "\n```" });
    }
    await message.edit({ embeds: [newEmbed] });
}

async function actualizarMensajeCalendario() {
    if (!torneoActivo || !torneoActivo.calendarioMessageId || !CALENDARIO_JORNADAS_CHANNEL_ID) return;
    
    const channel = await client.channels.fetch(CALENDARIO_JORNADAS_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(torneoActivo.calendarioMessageId).catch(() => null);
    if (!message) return;

    const newEmbed = EmbedBuilder.from(message.embeds[0])
        .setDescription('Calendario completo del torneo.')
        .setFields([]);

    const calendarioOrdenado = Object.keys(torneoActivo.calendario).sort();
    let allFields = [];

    for (const groupName of calendarioOrdenado) {
        const partidosDelGrupo = torneoActivo.calendario[groupName];
        
        const partidosPorJornada = {};
        for (const partido of partidosDelGrupo) {
            if (!partidosPorJornada[partido.jornada]) partidosPorJornada[partido.jornada] = [];
            partidosPorJornada[partido.jornada].push(partido);
        }

        let groupScheduleText = '';
        const nameWidth = 15;
        const centerWidth = 6;

        for (const jornadaNum of Object.keys(partidosPorJornada).sort((a,b) => a - b)) {
            groupScheduleText += `Jornada ${jornadaNum}\n`;
            for (const partido of partidosPorJornada[jornadaNum]) {
                const centerText = partido.resultado ? partido.resultado : 'vs';
                const paddingTotal = centerWidth - centerText.length;
                const paddingInicio = Math.ceil(paddingTotal / 2);
                const paddingFin = Math.floor(paddingTotal / 2);
                const paddedCenter = ' '.repeat(paddingInicio) + centerText + ' '.repeat(paddingFin);
                const equipoA = partido.equipoA.nombre.slice(0, nameWidth).padEnd(nameWidth);
                const equipoB = partido.equipoB.nombre.slice(0, nameWidth).padStart(nameWidth);
                groupScheduleText += `${equipoA}${paddedCenter}${equipoB}\n`;
            }
        }
        allFields.push({ name: `**${groupName}**`, value: `\`\`\`\n${groupScheduleText.trim()}\n\`\`\``, inline: false });
    }

    newEmbed.setFields(allFields);
    await message.edit({ embeds: [newEmbed] });
}


client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.content.startsWith('!')) { if (message.content === SETUP_COMMAND && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) { await handleSetupCommand(message); } return; }
    try {
        const authorMember = message.member; if (!authorMember) return;
        let sourceLang = ''; let hasLangRole = false;
        const serverRoles = message.guild.roles.cache;
        for (const flag in languageRoles) { const roleInfo = languageRoles[flag]; const role = serverRoles.find(r => r.name === roleInfo.name); if (role && authorMember.roles.cache.has(role.id)) { sourceLang = roleInfo.code; hasLangRole = true; break; } }
        if (!hasLangRole) return;
        const targetLangCodes = new Set();
        message.channel.members.forEach(member => { for (const flag in languageRoles) { const roleInfo = languageRoles[flag]; const role = serverRoles.find(r => r.name === roleInfo.name); if (role && member.roles.cache.has(role.id) && roleInfo.code !== sourceLang) { targetLangCodes.add(roleInfo.code); } } });
        if (targetLangCodes.size === 0) return;
        const embeds = [];
        for (const targetCode of targetLangCodes) { const flag = Object.keys(languageRoles).find(f => languageRoles[f].code === targetCode); const { text } = await translate(message.content, { to: targetCode }); embeds.push({ description: `${flag} *${text}*`, color: 0x5865F2 }); }
        if (embeds.length > 0) await message.reply({ embeds, allowedMentions: { repliedUser: false } });
    } catch (error) { console.error('Error en traducción:', error); }
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) { try { await reaction.fetch(); } catch (error) { return; } }
    if (reaction.message.partial) { try { await reaction.message.fetch(); } catch (error) { return; } }

    if (!reaction.message.embeds[0] || !reaction.message.embeds[0].title || !reaction.message.embeds[0].title.includes('Selección de Idioma')) return;

    const emoji = reaction.emoji.name;
    const roleInfo = languageRoles[emoji];
    if (!roleInfo) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    try {
        const newRoleName = roleInfo.name;
        const roleToAdd = guild.roles.cache.find(r => r.name === newRoleName);
        if (!roleToAdd) return;
        if (member.roles.cache.has(roleToAdd.id)) return;

        const rolesToRemove = member.roles.cache.filter(role => Object.values(languageRoles).some(lang => lang.name === role.name));
        if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove, 'Cambiando rol de idioma.');
        }
        await member.roles.add(roleToAdd, 'Asignando rol de idioma.');
    } catch (error) {
        console.error('Error al asignar rol por reacción:', error);
    }
});

async function handleSetupCommand(message) {
    const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle(LANGUAGE_SETUP_TITLE) 
        .setDescription('Reacciona a tu bandera para traducir tus mensajes.\n*React with your flag to have your messages translated.*')
        .addFields(Object.values(languageRoles).map(role => ({ name: `${Object.keys(languageRoles).find(key => languageRoles[key] === role)} ${role.name}`, value: `\u200b`, inline: true })))
        .setFooter({ text: 'Solo puedes tener un rol de idioma.' });
    try {
        const sentMessage = await message.channel.send({ embeds: [embed] });
        for (const flag in languageRoles) { await sentMessage.react(flag); }
        await message.delete();
    } catch (error) { console.error('Error al enviar setup:', error); }
}

async function startBot() {
    console.log('[INIT] Conectando a la base de datos...');
    await connectDb();

    console.log('[INIT] Cargando datos iniciales...');
    botData = await loadInitialData();
    torneoActivo = botData.torneoActivo;

    // --- CORRECCIÓN FINAL --- Rehidratar las variables de acceso rápido desde el estado principal.
    if (torneoActivo) {
        console.log('[INIT] Torneo activo encontrado, rehidratando estado...');
        mensajeInscripcionId = torneoActivo.mensajeInscripcionId;
        listaEquiposMessageId = torneoActivo.listaEquiposMessageId;
    } else {
        console.log('[INIT] No hay torneo activo.');
        mensajeInscripcionId = null;
        listaEquiposMessageId = null;
    }
    
    console.log('[INIT] Datos cargados. Iniciando bot...');

    keepAlive();
    client.login(process.env.DISCORD_TOKEN);
}

startBot();
