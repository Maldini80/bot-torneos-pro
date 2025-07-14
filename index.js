// index.js - VERSIÓN FINAL COMPLETA (CON PERSISTENCIA + MEJORAS DE ADMIN Y PREMIOS)
require('dotenv').config();

const keepAlive = require('./keep_alive.js');
const { saveData, loadData } = require('./database.js'); // PERSISTENCIA

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { translate } = require('@vitalets/google-translate-api');

// PERSISTENCIA: En lugar de variables en memoria, cargamos todo desde el archivo db.json
let botData = loadData();
let torneoActivo = botData.torneoActivo;
let mensajeInscripcionId = botData.mensajeInscripcionId;
let listaEquiposMessageId = botData.listaEquiposMessageId;

// PERSISTENCIA: Función central para guardar todo el estado del bot en el archivo.
function saveBotState() {
    botData.torneoActivo = torneoActivo;
    botData.mensajeInscripcionId = mensajeInscripcionId;
    botData.listaEquiposMessageId = listaEquiposMessageId;
    saveData(botData);
}

// --- CONFIGURACIÓN ---
const ADMIN_CHANNEL_ID = '1393187598796587028';
const CATEGORY_ID = '1393225162584883280';
const ARBITRO_ROLE_ID = '1393505777443930183';
const INSCRIPCION_CHANNEL_ID = '1393942335645286412';
const SETUP_COMMAND = '!setup-idiomas';

// --- DATOS DE IDIOMAS Y NORMAS ---
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

// --- FUNCIONES AUXILIARES ---

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
        if (err.code !== 10003) { console.error(`Error al limpiar el canal ${channelId}:`, err); }
    }
}

async function crearCanalDePartido(guild, partido, tipoPartido = 'Grupo') {
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
    const channelName = `⚔️-${baseChannelName}`;
    try {
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: partido.equipoA.capitanId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: partido.equipoB.capitanId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: ARBITRO_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ],
        });
        partido.channelId = channel.id;
        const embed = new EmbedBuilder().setColor('#3498db').setTitle(`Partido: ${partido.equipoA.nombre} vs ${partido.equipoB.nombre}`).setDescription(`${description}\n\n🇪🇸 Usad este canal para coordinar y jugar vuestro partido. Cuando terminéis, usad los botones de abajo.\n\n🇬🇧 *Use this channel to coordinate and play your match. When you finish, use the buttons below.*`);
        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`reportar_resultado_v3_${partido.matchId}`).setLabel("Reportar Resultado / Report Result").setStyle(ButtonStyle.Primary).setEmoji("📊"),
            new ButtonBuilder().setCustomId(`solicitar_arbitraje_${partido.matchId}`).setLabel("Solicitar Arbitraje / Request Referee").setStyle(ButtonStyle.Danger).setEmoji("⚠️")
        );
        await channel.send({ content: `<@${partido.equipoA.capitanId}> y <@${partido.equipoB.capitanId}>`, embeds: [embed], components: [actionButtons] });
        console.log(`[INFO] Canal de partido creado: ${channel.name}`);
        saveBotState(); 
    } catch (error) {
        console.error(`[ERROR FATAL] No se pudo crear el canal del partido.`, error);
        throw error;
    }
}

async function updateMatchChannelName(partido) {
    if (!partido.channelId) return;
    try {
        const channel = await client.channels.fetch(partido.channelId);
        if (!channel) return;
        const cleanBaseName = channel.name.replace(/^[⚔️✅⚠️]-/g, '').replace(/-\d+a\d+$/, '');
        let icon;
        if (partido.status === 'finalizado') icon = '✅';
        else if (partido.status === 'arbitraje') icon = '⚠️';
        else icon = '⚔️';
        let newName = `${icon}-${cleanBaseName}`;
        if (partido.status === 'finalizado' && partido.resultado) {
             const resultString = partido.resultado.replace('-', 'a');
             newName = `${newName}-${resultString}`;
        }
        await channel.setName(newName.slice(0, 100));
    } catch(err) {
        if (err.code !== 10003) { console.error(`Error al renombrar canal ${partido.channelId}:`, err); }
    }
}

async function mostrarMensajeEspera(interaction) {
    const channel = await client.channels.fetch(INSCRIPCION_CHANNEL_ID).catch(() => null);
    if (!channel) {
        console.log("No se encontró el canal de inscripciones.");
        if(interaction) await interaction.followUp({ content: 'Error: Canal de inscripción no encontrado.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    await limpiarCanal(INSCRIPCION_CHANNEL_ID);
    const waitEmbed = new EmbedBuilder().setColor('#34495e').setTitle('⏳ 🇪🇸 Torneo en Espera / 🇬🇧 Tournament on Standby').setDescription('🇪🇸 Actualmente no hay ningún torneo activo.\n\n🇬🇧 *There are currently no active tournaments.*');
    await channel.send({ embeds: [waitEmbed] });
}

client.once('ready', async () => {
    console.log(`Bot conectado como ${client.user.tag}!`);
    if (!torneoActivo) {
        await mostrarMensajeEspera();
    }
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

// --- MANEJADOR DE INTERACCIONES ---
client.on('interactionCreate', async interaction => {
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
        if (error.code === 10062) {
            console.warn(`[WARN] Interacción expirada (token inválido). El bot tardó demasiado en responder. Esto es normal en cold starts y se ignora.`);
            return;
        }
        console.error('Ha ocurrido un error en el manejador de interacciones:', error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '🇪🇸 Hubo un error al procesar tu solicitud.\n🇬🇧 *An error occurred while processing your request.*', flags: [MessageFlags.Ephemeral] });
            } else {
                 await interaction.reply({ content: '🇪🇸 Hubo un error al procesar tu solicitud.\n🇬🇧 *An error occurred while processing your request.*', flags: [MessageFlags.Ephemeral] });
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
        const embed = new EmbedBuilder().setColor('#2c3e50').setTitle('Panel de Control del Torneo').setDescription('🇪🇸 Usa los botones de abajo para gestionar el torneo.\n🇬🇧 Use the buttons below to manage the tournament.');
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_crear').setLabel('Crear Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆'), 
            new ButtonBuilder().setCustomId('panel_add_test').setLabel('Añadir Equipos Prueba').setStyle(ButtonStyle.Secondary).setEmoji('🧪')
        );
        // AÑADIDO: Nuevos botones de información para el admin.
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_ver_inscritos').setLabel('Ver Inscritos').setStyle(ButtonStyle.Primary).setEmoji('📋'),
            new ButtonBuilder().setCustomId('panel_ver_pendientes').setLabel('Ver Pendientes').setStyle(ButtonStyle.Primary).setEmoji('⏳')
        );
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_simular_partidos').setLabel('Simular Partidos').setStyle(ButtonStyle.Secondary).setEmoji('🎲'), 
            new ButtonBuilder().setCustomId('panel_borrar_canales').setLabel('Borrar Canales Partido').setStyle(ButtonStyle.Danger).setEmoji('🗑️'), 
            new ButtonBuilder().setCustomId('panel_finalizar').setLabel('Finalizar Torneo').setStyle(ButtonStyle.Danger).setEmoji('🛑')
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

async function handleButton(interaction) {
    const { customId } = interaction;
    if (customId.startsWith('panel_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permisos para usar los botones del panel.', flags: [MessageFlags.Ephemeral] });
        }
        
        const [panel, type, subtype] = customId.split('_');

        // AÑADIDO: Lógica para el botón de ver inscritos
        if (type === 'ver' && subtype === 'inscritos') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            if (!torneoActivo || Object.keys(torneoActivo.equipos_aprobados || {}).length === 0) {
                return interaction.editReply({ content: 'No hay equipos inscritos (aprobados) en este momento.' });
            }
            const listaEquipos = Object.values(torneoActivo.equipos_aprobados)
                .map((equipo, index) => `${index + 1}. **${equipo.nombre}** (Capitán: ${equipo.capitanTag})`)
                .join('\n');
            const embed = new EmbedBuilder()
                .setTitle('📋 Lista de Equipos Inscritos')
                .setDescription(listaEquipos)
                .setColor('#3498DB')
                .setFooter({ text: `Total: ${Object.keys(torneoActivo.equipos_aprobados).length} / ${torneoActivo.size}` });
            return interaction.editReply({ embeds: [embed] });
        }

        // AÑADIDO: Lógica para el botón de ver pendientes
        if (type === 'ver' && subtype === 'pendientes') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            if (!torneoActivo || Object.keys(torneoActivo.equipos_pendientes || {}).length === 0) {
                return interaction.editReply({ content: 'No hay equipos pendientes de aprobación en este momento.' });
            }
            const listaPendientes = Object.values(torneoActivo.equipos_pendientes)
                .map((equipo, index) => `${index + 1}. **${equipo.nombre}** (Capitán: ${equipo.capitanTag}) - PayPal: \`${equipo.paypal || 'No especificado'}\``)
                .join('\n');
            const embed = new EmbedBuilder()
                .setTitle('⏳ Lista de Equipos Pendientes de Aprobación')
                .setDescription(listaPendientes)
                .setColor('#E67E22');
            return interaction.editReply({ embeds: [embed] });
        }

        if (customId !== 'panel_crear' && customId !== 'panel_add_test') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        }

        if (type === 'crear') {
            const sizeMenu = new StringSelectMenuBuilder()
                .setCustomId('crear_torneo_size_select')
                .setPlaceholder('Paso 1: Selecciona el tamaño del torneo')
                .addOptions([
                    { label: '8 Equipos', description: '2 grupos, clasifican los 2 primeros.', value: '8' },
                    { label: '16 Equipos', description: '4 grupos, clasifica el primero.', value: '16' },
                ]);
            const row = new ActionRowBuilder().addComponents(sizeMenu);
            await interaction.reply({ content: 'Iniciando creación de torneo...', components: [row], flags: [MessageFlags.Ephemeral] });
        } else if (type === 'add' && subtype === 'test') {
            const modal = new ModalBuilder().setCustomId('add_test_modal').setTitle('Añadir Equipos de Prueba');
            const cantidadInput = new TextInputBuilder().setCustomId('cantidad_input').setLabel("¿Cuántos equipos de prueba quieres añadir?").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(cantidadInput));
            await interaction.showModal(modal);
        } else if (type === 'simular' && subtype === 'partidos') {
            if (!torneoActivo || torneoActivo.status !== 'fase_de_grupos') {
                 return interaction.editReply({ content: 'Solo se pueden simular partidos durante la fase de grupos.' });
            }
            let partidosSimulados = 0;
            for (const groupName in torneoActivo.calendario) {
                for (const partido of torneoActivo.calendario[groupName]) {
                    if (partido.status !== 'finalizado') {
                        const golesA = Math.floor(Math.random() * 5);
                        const golesB = Math.floor(Math.random() * 5);
                        partido.resultado = `${golesA}-${golesB}`;
                        partido.status = 'finalizado';
                        const equipoA = torneoActivo.grupos[groupName].equipos.find(e => e.id === partido.equipoA.id);
                        const equipoB = torneoActivo.grupos[groupName].equipos.find(e => e.id === partido.equipoB.id);
                        if (equipoA && equipoB) {
                            equipoA.stats.pj += 1;
                            equipoB.stats.pj += 1;
                            equipoA.stats.gf += golesA;
                            equipoB.stats.gf += golesB;
                            equipoA.stats.gc += golesB;
                            equipoB.stats.gc += golesA;
                            if (golesA > golesB) equipoA.stats.pts += 3;
                            else if (golesB > golesA) equipoB.stats.pts += 3;
                            else {
                                equipoA.stats.pts += 1;
                                equipoB.stats.pts += 1;
                            }
                            equipoA.stats.dg = equipoA.stats.gf - equipoA.stats.gc;
                            equipoB.stats.dg = equipoB.stats.gf - equipoB.stats.gc;
                        }
                        partidosSimulados++;
                        await updateMatchChannelName(partido);
                    }
                }
            }
            saveBotState();
            await actualizarMensajeClasificacion();
            await interaction.editReply({ content: `✅ Se han simulado ${partidosSimulados} partidos. La clasificación ha sido actualizada.` });
            await iniciarFaseEliminatoria(interaction.guild);
        } else if (type === 'borrar' && subtype === 'canales') {
            const allChannels = await interaction.guild.channels.fetch();
            const matchChannels = allChannels.filter(c => c.parentId === CATEGORY_ID);
            await interaction.editReply({ content: `Borrando ${matchChannels.size} canales de partido...` });
            let deletedCount = 0;
            for (const channel of matchChannels.values()) {
                await channel.delete('Limpieza de canales de torneo.').catch(err => console.error(`No se pudo borrar el canal ${channel.name}: ${err}`));
                deletedCount++;
            }
            await interaction.followUp({ content: `✅ ${deletedCount} canales de partido borrados.`, flags: [MessageFlags.Ephemeral] });
        } else if (type === 'finalizar') {
            if (!torneoActivo) return interaction.editReply({ content: 'No hay ningún torneo activo para finalizar.' });
            
            // AÑADIDO: Mensaje público de finalización.
            const announcementChannel = await client.channels.fetch(INSCRIPCION_CHANNEL_ID).catch(() => null);
            if (announcementChannel) {
                const finalEmbed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle(`🏁 Torneo Finalizado: ${torneoActivo.nombre}`)
                    .setDescription('El torneo ha concluido. ¡Gracias a todos por participar! Los canales serán eliminados en breve.')
                    .setTimestamp();
                await announcementChannel.send({ embeds: [finalEmbed] });
            }

            await interaction.editReply({ content: 'Finalizando torneo y borrando canales...' });
            await limpiarCanal(INSCRIPCION_CHANNEL_ID);
            if (torneoActivo.canalEquiposId) { const c = await client.channels.fetch(torneoActivo.canalEquiposId).catch(()=>null); if(c) await c.delete(); }
            if (torneoActivo.canalGruposId) { const c = await client.channels.fetch(torneoActivo.canalGruposId).catch(()=>null); if(c) await c.delete(); }
            const allChannels = await interaction.guild.channels.fetch();
            const matchChannels = allChannels.filter(c => c.parentId === CATEGORY_ID);
            for (const channel of matchChannels.values()) { await channel.delete('Finalización de torneo.').catch(err => {}); }
            torneoActivo = null;
            mensajeInscripcionId = null;
            listaEquiposMessageId = null;
            saveBotState();
            await mostrarMensajeEspera(interaction);
            await interaction.followUp({ content: '✅ Torneo finalizado y todos los canales reseteados.', flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    else if (customId.startsWith('rules_')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
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
            return interaction.editReply({ content: 'Error: No he podido encontrar el servidor. Es posible que haya sido desconectado.' });
        }
        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) {
            return interaction.editReply({ content: 'Error: No pude encontrarte como miembro del servidor.' });
        }
        try {
            const rolesToRemove = [];
            for (const flag in languageRoles) {
                const roleNameToRemove = languageRoles[flag].name;
                const role = guild.roles.cache.find(r => r.name === roleNameToRemove);
                if (role && member.roles.cache.has(role.id)) {
                    rolesToRemove.push(role);
                }
            }
            if (rolesToRemove.length > 0) {
                await member.roles.remove(rolesToRemove, 'Cambiando rol de idioma');
            }
            const roleToAdd = guild.roles.cache.find(r => r.name === roleInfo.name);
            if (roleToAdd) {
                await member.roles.add(roleToAdd, 'Asignando rol de idioma por botón');
                await interaction.editReply({ content: `✅ ¡Idioma establecido a **${roleInfo.name}**! Ya puedes participar en el servidor.\n\n✅ *Language set to **${roleInfo.name}**! You can now participate in the server.*` });
            } else {
                console.warn(`[ADVERTENCIA] El rol de idioma "${roleInfo.name}" no fue encontrado en el servidor.`);
                await interaction.editReply({ content: `Error: El rol para ${roleInfo.name} no existe. Por favor, contacta a un administrador.` });
            }
        } catch (error) {
            console.error('Error al asignar rol de idioma desde botón:', error);
            await interaction.editReply({ content: 'Hubo un error al intentar asignarte el rol. Revisa que el bot tenga permisos para gestionar roles.' });
        }
        return;
    }

    if (customId === 'inscribir_equipo_btn') {
        if (!torneoActivo || torneoActivo.status !== 'inscripcion_abierta') {
            return interaction.reply({ content: '🇪🇸 Las inscripciones no están abiertas o el torneo ha sido borrado por un reinicio.\n🇬🇧 *Registrations are not open or the tournament was deleted by a restart.*', flags: [MessageFlags.Ephemeral] });
        }
        const modal = new ModalBuilder().setCustomId('inscripcion_modal').setTitle('Inscripción de Equipo');
        const teamNameInput = new TextInputBuilder().setCustomId('nombre_equipo_input').setLabel("Nombre del equipo (3-8 caracteres)").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(8).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput));
        await interaction.showModal(modal);
    } else if (customId === 'pago_realizado_btn') {
        const modal = new ModalBuilder().setCustomId('pago_realizado_modal').setTitle('Confirmar Pago');
        const paypalInput = new TextInputBuilder().setCustomId('paypal_info_input').setLabel("Tu email o usuario de PayPal").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
        await interaction.showModal(modal);
    } else if (customId.startsWith('reportar_resultado_v3_')) {
        const matchId = customId.replace('reportar_resultado_v3_', '');
        const { partido } = findMatch(matchId);
        if(!partido) return interaction.reply({content: "Error: No se pudo encontrar el partido para este botón. El torneo puede haber finalizado.", flags: [MessageFlags.Ephemeral] });
        const modal = new ModalBuilder().setCustomId(`reportar_resultado_modal_${matchId}`).setTitle('Reportar Resultado');
        const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
        const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        await interaction.showModal(modal);
    } else if (customId.startsWith('solicitar_arbitraje_')) {
        const matchId = customId.replace('solicitar_arbitraje_', '');
        const { partido } = findMatch(matchId);
        if(!partido) return interaction.reply({content: "🇪🇸 Error: No se pudo encontrar el partido.\n🇬🇧 *Error: Match not found.*", flags: [MessageFlags.Ephemeral] });
        if(partido.status !== 'finalizado') {
            partido.status = 'arbitraje';
            saveBotState();
            await updateMatchChannelName(partido);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_modificar_resultado_${matchId}`).setLabel("Modificar Resultado (Admin)").setStyle(ButtonStyle.Secondary).setEmoji("✍️"));
            const arbitroRole = await interaction.guild.roles.fetch(ARBITRO_ROLE_ID).catch(() => null);
            await interaction.reply({ content: `${arbitroRole} 🇪🇸 Se ha solicitado arbitraje en este partido.\n🇬🇧 *A referee has been requested for this match.*`, components: [row] });
        } else {
            await interaction.reply({ content: `🇪🇸 No se puede solicitar arbitraje para este partido.\n🇬🇧 *You cannot request a referee for this match.*`, flags: [MessageFlags.Ephemeral] });
        }
    } else if (customId.startsWith('admin_aprobar_') || customId.startsWith('admin_rechazar_') || customId.startsWith('admin_expulsar_')) {
        const [action, type, captainId] = customId.split('_');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: 'No tienes permisos.', flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        if (!torneoActivo) {
            return interaction.editReply({ content: 'Error: No se encontró un torneo activo. Es posible que el bot se haya reiniciado. Por favor, crea el torneo de nuevo.' });
        }

        if (type === 'expulsar') {
            if (torneoActivo.status !== 'inscripcion_abierta') {
                return interaction.editReply({ content: 'Solo se pueden expulsar equipos durante la fase de inscripción.' });
            }
            const teamToKick = torneoActivo.equipos_aprobados[captainId];
            if (!teamToKick) return interaction.editReply({ content: 'Error: No se pudo encontrar a este equipo. Quizás ya fue expulsado.' });

            delete torneoActivo.equipos_aprobados[captainId];
            saveBotState();

            const equiposChannel = await client.channels.fetch(torneoActivo.canalEquiposId).catch(() => null);
            if (equiposChannel && listaEquiposMessageId) {
                const listaMsg = await equiposChannel.messages.fetch(listaEquiposMessageId).catch(() => null);
                if(listaMsg) {
                    const nombresEquipos = Object.values(torneoActivo.equipos_aprobados).map((e, index) => `${index + 1}. ${e.bandera||''} ${e.nombre} (Capitán: ${e.capitanTag})`).join('\n');
                    const embedLista = EmbedBuilder.from(listaMsg.embeds[0]).setDescription(nombresEquipos || 'Aún no hay equipos inscritos.').setFooter({ text: `Total: ${Object.keys(torneoActivo.equipos_aprobados).length} / ${torneoActivo.size}` });
                    await listaMsg.edit({ embeds: [embedLista] });
                }
            }
            const captainUser = await client.users.fetch(captainId).catch(() => null);
            if(captainUser) {
                await captainUser.send(`🇪🇸 Tu equipo **${teamToKick.nombre}** ha sido eliminado del torneo por un administrador.\n🇬🇧 Your team **${teamToKick.nombre}** has been removed from the tournament by an administrator.`).catch(() => {});
            }
            const originalMessage = interaction.message;
            const newEmbed = EmbedBuilder.from(originalMessage.embeds[0]).setTitle('❌ EQUIPO EXPULSADO').setColor('#E74C3C').setFooter({ text: `Expulsado por ${interaction.user.tag}`});
            const disabledButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('kicked_done').setLabel('Expulsado').setStyle(ButtonStyle.Danger).setDisabled(true));
            await originalMessage.edit({ embeds: [newEmbed], components: [disabledButtons] });
            await interaction.editReply({ content: `✅ El equipo **${teamToKick.nombre}** ha sido expulsado del torneo. Hay una nueva plaza libre.` });
        } else {
            const equipoPendiente = torneoActivo.equipos_pendientes[captainId];
            if (!equipoPendiente) return interaction.editReply({ content: 'Este equipo ya no está pendiente o el bot se reinició.' });
            const originalMessage = interaction.message;
            const newEmbed = EmbedBuilder.from(originalMessage.embeds[0]);
            const newButtons = new ActionRowBuilder();
            if (type === 'aprobar') {
                if (!torneoActivo.equipos_aprobados) torneoActivo.equipos_aprobados = {};
                equipoPendiente.id = captainId;
                const captainMember = await interaction.guild.members.fetch(captainId).catch(()=>null);
                let captainFlag = '🏳️';
                if (captainMember) { for (const flag in languageRoles) { const role = interaction.guild.roles.cache.find(r => r.name === languageRoles[flag].name); if (role && captainMember.roles.cache.has(role.id)) { captainFlag = flag; break; } } }
                equipoPendiente.bandera = captainFlag;
                torneoActivo.equipos_aprobados[captainId] = equipoPendiente;
                delete torneoActivo.equipos_pendientes[captainId];
                saveBotState(); 
                
                newEmbed.setColor('#2ECC71').setTitle('✅ EQUIPO APROBADO').addFields({ name: 'Aprobado por', value: interaction.user.tag });
                newButtons.addComponents(new ButtonBuilder().setCustomId(`admin_expulsar_${captainId}`).setLabel('Expulsar Equipo').setStyle(ButtonStyle.Danger).setEmoji('✖️'));
                const captainUser = await client.users.fetch(captainId).catch(()=>null);
                if(captainUser) {
                    const approvalMessage = `✅ 🇪🇸 ¡Tu inscripción para el equipo **${equipoPendiente.nombre}** ha sido aprobada!\n\n🇬🇧 Your registration for the team **${equipoPendiente.nombre}** has been approved!`;
                    await captainUser.send(approvalMessage).catch(()=>{ console.log(`No se pudo enviar DM de aprobación a ${captainUser.tag}.`); });
                }
                await originalMessage.edit({ embeds: [newEmbed], components: [newButtons] });
                await interaction.editReply({ content: `Acción 'aprobar' completada.` });
                const equiposChannel = await client.channels.fetch(torneoActivo.canalEquiposId).catch(()=>null);
                if (equiposChannel && listaEquiposMessageId) {
                    const listaMsg = await equiposChannel.messages.fetch(listaEquiposMessageId).catch(()=>null);
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

                newEmbed.setColor('#e74c3c').setTitle('❌ INSCRIPCIÓN RECHAZADA').addFields({ name: 'Rechazado por', value: interaction.user.tag });
                newButtons.addComponents(new ButtonBuilder().setCustomId('done_reject').setLabel('Rechazado').setStyle(ButtonStyle.Danger).setDisabled(true));
                await originalMessage.edit({ embeds: [newEmbed], components: [newButtons] });
                await interaction.editReply({ content: `Acción 'rechazar' completada.` });
            }
        }
    } else if (customId.startsWith('admin_modificar_resultado_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: 'No tienes permisos.', flags: [MessageFlags.Ephemeral] });
        const matchId = customId.replace('admin_modificar_resultado_', '');
        const { partido } = findMatch(matchId);
        if (!partido) return interaction.reply({ content: "Error: No se pudo encontrar el partido.", flags: [MessageFlags.Ephemeral] });
        const modal = new ModalBuilder().setCustomId(`admin_modificar_modal_${matchId}`).setTitle('Modificar Resultado (Admin)');
        const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[0] : '0');
        const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[1] : '0');
        modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
        await interaction.showModal(modal);
    } else if (customId.startsWith('admin_confirm_payment_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '🇪🇸 No tienes permisos para esta acción.\n🇬🇧 *You do not have permission for this action.*', flags: [MessageFlags.Ephemeral] });
        }
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const winnerId = customId.split('_').pop(); // Acepta el nuevo formato de customId
        const winner = await client.users.fetch(winnerId).catch(() => null);
        if (!winner) {
            return interaction.editReply({ content: 'No se pudo encontrar al usuario ganador.' });
        }
        const dmEmbed = new EmbedBuilder().setColor('#2ECC71').setTitle('💸 ¡Premio Recibido! / Prize Received!').setDescription(`🇪🇸 ¡Felicidades! El premio del torneo **${torneoActivo.nombre}** ha sido abonado en tu cuenta.\n\n🇬🇧 Congratulations! The prize for the **${torneoActivo.nombre}** tournament has been sent to your account.`);
        try {
            await winner.send({ embeds: [dmEmbed] });
        } catch (e) {
            console.error(`No se pudo enviar el DM de confirmación de pago a ${winner.tag}`);
            return interaction.editReply({ content: `No se pudo enviar el DM al ganador, pero la acción se ha registrado. Puede que tenga los DMs cerrados.` });
        }
        const originalMessage = interaction.message;
        const newEmbed = EmbedBuilder.from(originalMessage.embeds[0]).setFooter({ text: `Pago confirmado por ${interaction.user.tag}`}).setColor('#1ABC9C');
        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]);
        disabledRow.components.forEach(component => {
            if (component.data.custom_id === customId) {
                component.setDisabled(true).setLabel('Pago Confirmado');
            }
        });
        await originalMessage.edit({ embeds: [newEmbed], components: [disabledRow] });
        await interaction.editReply({ content: `✅ Notificación de pago enviado correctamente al ganador.` });
    }
}

async function handleSelectMenu(interaction) {
    if (interaction.customId === 'crear_torneo_size_select') {
        const size = interaction.values[0];
        const typeMenu = new StringSelectMenuBuilder()
            .setCustomId(`crear_torneo_type_select_${size}`)
            .setPlaceholder('Paso 2: Selecciona el tipo de torneo')
            .addOptions([
                { label: 'De Pago', description: 'Se solicitará un pago para inscribirse.', value: 'pago' },
                { label: 'Gratuito', description: 'Inscripción gratuita.', value: 'gratis' },
            ]);
        const row = new ActionRowBuilder().addComponents(typeMenu);
        await interaction.update({ content: `Tamaño seleccionado: **${size} equipos**. Ahora, selecciona el tipo de torneo:`, components: [row] });
    } else if (interaction.customId.startsWith('crear_torneo_type_select_')) {
        const size = interaction.customId.split('_').pop();
        const type = interaction.values[0];
        const modal = new ModalBuilder().setCustomId(`crear_torneo_final_${size}_${type}`).setTitle('Finalizar Creación de Torneo');
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

    if (customId.startsWith('crear_torneo_final_')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const [, , , sizeStr, type] = customId.split('_');
        const size = parseInt(sizeStr);
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
                return interaction.editReply({ content: 'Debes proporcionar un enlace de PayPal y premios numéricos válidos.' });
            }
        }

        const inscripcionChannel = await client.channels.fetch(INSCRIPCION_CHANNEL_ID).catch(() => null);
        if (!inscripcionChannel) {
            return interaction.editReply({ content: `❌ **Error:** No se puede encontrar el canal de inscripciones.`});
        }
        await limpiarCanal(INSCRIPCION_CHANNEL_ID);
        const channelName = `📝-equipos-${nombre.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`;
        const equiposChannel = await interaction.guild.channels.create({ name: channelName, type: ChannelType.GuildText, topic: `Lista de equipos del torneo ${nombre}.` });
        
        torneoActivo = { nombre, size, isPaid, prizeCampeon, prizeFinalista, status: 'inscripcion_abierta', enlace_paypal: enlacePaypal, equipos_pendientes: {}, equipos_aprobados: {}, canalEquiposId: equiposChannel.id, canalGruposId: null, publicGroupsMessageId: null, calendario: {}, grupos: {}, eliminatorias: {} };
        
        let prizeText = isPaid ? `**Premio Campeón:** ${prizeCampeon}€\n**Premio Finalista:** ${prizeFinalista}€` : '**Precio:** Gratis / *Free*';
        const embed = new EmbedBuilder().setColor('#5865F2').setTitle(`🏆 Inscripciones Abiertas: ${nombre}`).setDescription(`Para participar, haz clic abajo.\n*To participate, click below.*\n\n${prizeText}\n\n**Límite:** ${size} equipos.`);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('inscribir_equipo_btn').setLabel('Inscribir Equipo / Register Team').setStyle(ButtonStyle.Success).setEmoji('📝'));
        const newMessage = await inscripcionChannel.send({ embeds: [embed], components: [row] });
        mensajeInscripcionId = newMessage.id;
        const embedLista = new EmbedBuilder().setColor('#3498db').setTitle(`Equipos Inscritos - ${nombre}`).setDescription('Aún no hay equipos.').setFooter({ text: `Total: 0 / ${size}` });
        const listaMsg = await equiposChannel.send({ embeds: [embedLista] });
        listaEquiposMessageId = listaMsg.id;
        
        saveBotState();
        
        await interaction.editReply({ content: `✅ Torneo "${nombre}" (${size} equipos, ${isPaid ? 'de Pago' : 'Gratis'}) creado. Canal de equipos: ${equiposChannel}.` });

    } else if (customId === 'inscripcion_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        if (!torneoActivo) {
            return interaction.editReply({ content: '❌ Error: El torneo al que intentas inscribirte ya no existe. Probablemente el bot se reinició. Por favor, contacta a un administrador.' });
        }
        const teamName = fields.getTextInputValue('nombre_equipo_input');

        if (teamName.length < 3 || teamName.length > 8) {
            return interaction.editReply({ content: '🇪🇸 El nombre del equipo debe tener entre 3 y 8 caracteres.\n🇬🇧 *Team name must be between 3 and 8 characters long.*' });
        }

        const allTeamNames = [
            ...Object.values(torneoActivo.equipos_aprobados || {}).map(e => e.nombre.toLowerCase()),
            ...Object.values(torneoActivo.equipos_pendientes || {}).map(e => e.nombre.toLowerCase())
        ];

        if (allTeamNames.includes(teamName.toLowerCase())) {
            return interaction.editReply({ content: '🇪🇸 Ya existe un equipo con este nombre. Por favor, elige otro.\n🇬🇧 *A team with this name already exists. Please choose another one.*' });
        }

        if (torneoActivo.status !== 'inscripcion_abierta') return interaction.editReply('🇪🇸 Las inscripciones no están abiertas.\n🇬🇧 *Registrations are not open.*');
        if (Object.keys(torneoActivo.equipos_aprobados || {}).length >= torneoActivo.size) return interaction.editReply('🇪🇸 El cupo está lleno.\n🇬🇧 *The registration limit is full.*');
        if ((torneoActivo.equipos_pendientes || {})[interaction.user.id] || (torneoActivo.equipos_aprobados || {})[interaction.user.id]) return interaction.editReply('🇪🇸 Ya estás inscrito.\n🇬🇧 *You are already registered.*');
        if (!torneoActivo.equipos_pendientes) torneoActivo.equipos_pendientes = {};

        torneoActivo.equipos_pendientes[interaction.user.id] = { nombre: teamName, capitanTag: interaction.user.tag, capitanId: interaction.user.id };
        saveBotState();

        if (torneoActivo.isPaid) {
            const embed = new EmbedBuilder().setColor('#f1c40f').setTitle('🇪🇸 Inscripción Recibida - Pendiente de Pago / 🇬🇧 Registration Received - Pending Payment').addFields({ name: 'Enlace de Pago / Payment Link', value: torneoActivo.enlace_paypal }, { name: 'Siguiente Paso / Next Step', value: "🇪🇸 Cuando hayas pagado, haz clic abajo para notificar.\n🇬🇧 Once you have paid, click the button below to notify." });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pago_realizado_btn').setLabel('✅ He Realizado el Pago / I Have Paid').setStyle(ButtonStyle.Success));
            try {
                await interaction.user.send({ embeds: [embed], components: [row] });
                await interaction.editReply({ content: '✅ 🇪🇸 ¡Revisa tus DMs para las instrucciones de pago!\n🇬🇧 *Check your DMs for payment instructions!*' });
            } catch {
                await interaction.editReply({ content: '❌ 🇪🇸 No pude enviarte un DM. Por favor, revisa tu configuración de privacidad.\n🇬🇧 *I could not send you a DM. Please check your privacy settings.*' });
            }
        } else {
            const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
            if (adminChannel) {
                const adminEmbed = new EmbedBuilder().setColor('#3498DB').setTitle('🔔 Nueva Inscripción (Torneo Gratis)').addFields({ name: 'Equipo', value: teamName, inline: true }, { name: 'Capitán', value: interaction.user.tag, inline: true });
                const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_aprobar_${interaction.user.id}`).setLabel('Aprobar').setStyle(ButtonStyle.Success).setEmoji('✅'), new ButtonBuilder().setCustomId(`admin_rechazar_${interaction.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger).setEmoji('❌'));
                await adminChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
            }
            await interaction.editReply({ content: '✅ 🇪🇸 ¡Inscripción recibida! Un administrador aprobará tu equipo en breve.\n🇬🇧 *Registration received! An administrator will approve your team shortly.*' });
        }

    } else if (customId === 'pago_realizado_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        if (!torneoActivo) {
            return interaction.editReply({ content: '❌ Error: El torneo para el que intentas pagar ya no existe.' });
        }
        const paypalInfo = fields.getTextInputValue('paypal_info_input');
        const pendingTeamData = (torneoActivo.equipos_pendientes || {})[interaction.user.id];
        if (!pendingTeamData) return interaction.editReply({ content: '🇪🇸 No encontré tu inscripción pendiente.\n🇬🇧 *Could not find your pending registration.*' });

        pendingTeamData.paypal = paypalInfo;
        saveBotState();

        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
        if (adminChannel) {
            const adminEmbed = new EmbedBuilder().setColor('#e67e22').setTitle('🔔 Notificación de Pago').addFields({ name: 'Equipo', value: pendingTeamData.nombre, inline: true }, { name: 'Capitán', value: interaction.user.tag, inline: true }, { name: 'PayPal Indicado', value: paypalInfo, inline: false });
            const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_aprobar_${interaction.user.id}`).setLabel('Aprobar').setStyle(ButtonStyle.Success).setEmoji('✅'), new ButtonBuilder().setCustomId(`admin_rechazar_${interaction.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger).setEmoji('❌'));
            await adminChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
        }
        await interaction.editReply({ content: '✅ 🇪🇸 ¡Gracias! Un administrador ha sido notificado.\n🇬🇧 *Thank you! An administrator has been notified.*' });
    } else if (customId === 'add_test_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const cantidad = parseInt(fields.getTextInputValue('cantidad_input'));
        if (isNaN(cantidad) || cantidad <= 0) return interaction.editReply('Número inválido.');
        if (!torneoActivo) return interaction.editReply('Primero crea un torneo.');
        if (!torneoActivo.equipos_aprobados) torneoActivo.equipos_aprobados = {};
        
        // CORREGIDO: Los equipos de prueba ahora usan la bandera de idioma del admin.
        const adminMember = interaction.member;
        let adminFlag = '🧪'; // Default
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
            const teamId = `prueba_${Date.now()}_${i}`;
            const nombreEquipo = `E-Prueba-${initialCount + i + 1}`;
            torneoActivo.equipos_aprobados[teamId] = { id: teamId, nombre: nombreEquipo, capitanId: capitanDePruebaId, capitanTag: capitanDePruebaTag, bandera: adminFlag, paypal: 'admin@test.com' };
        }
        saveBotState();
        await interaction.editReply(`✅ ${cantidad} equipos de prueba añadidos.`);
        const equiposChannel = await client.channels.fetch(torneoActivo.canalEquiposId).catch(() => null);
        if (equiposChannel && listaEquiposMessageId) {
             const listaMsg = await equiposChannel.messages.fetch(listaEquiposMessageId).catch(()=>null);
             if(listaMsg) {
                const nombresEquipos = Object.values(torneoActivo.equipos_aprobados).map((e, i) => `${i + 1}. ${e.bandera||''} ${e.nombre} (Capi: ${e.capitanTag})`).join('\n');
                const embedLista = EmbedBuilder.from(listaMsg.embeds[0]).setDescription(nombresEquipos).setFooter({ text: `Total: ${Object.keys(torneoActivo.equipos_aprobados).length} / ${torneoActivo.size}` });
                await listaMsg.edit({ embeds: [embedLista] });
             }
        }
    } else if (customId.startsWith('reportar_resultado_modal_')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const matchId = customId.replace('reportar_resultado_modal_', '');
        const golesA = parseInt(fields.getTextInputValue('goles_a'));
        const golesB = parseInt(fields.getTextInputValue('goles_b'));

        if (isNaN(golesA) || isNaN(golesB)) {
            return interaction.editReply("🇪🇸 Formato de resultado inválido. Introduce solo números.\n🇬🇧 *Invalid result format. Please enter numbers only.*");
        }
        const { partido } = findMatch(matchId);
        if (!partido) {
            return interaction.editReply("🇪🇸 Error: Partido no encontrado.\n🇬🇧 *Error: Match not found.*");
        }
        if (partido.resultado) {
            return interaction.editReply("🇪🇸 Este partido ya tiene un resultado. Un admin puede modificarlo.\n🇬🇧 *This match already has a result. An admin can modify it.*");
        }

        if (partido.equipoA.capitanId === partido.equipoB.capitanId) {
            partido.resultado = `${golesA}-${golesB}`;
            partido.status = 'finalizado';
            await interaction.editReply(`✅ 🇪🇸 Resultado ${partido.resultado} confirmado automáticamente (modo prueba).\n🇬🇧 *Result ${partido.resultado} confirmed automatically (test mode).*`);
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
                await interaction.editReply(`✅ 🇪🇸 Resultado ${partido.resultado} confirmado por ambos capitanes.\n🇬🇧 *Result ${partido.resultado} confirmed by both captains.*`);
                await procesarResultadoFinal(partido, interaction);
            } else {
                partido.reportedScores = {};
                await interaction.editReply(`❌ 🇪🇸 Los resultados no coinciden. Se han reseteado.\n🇬🇧 *The reported results do not match. They have been reset.*`);
            }
        } else {
            await interaction.editReply(`✅ 🇪🇸 Tu resultado (${golesA}-${golesB}) ha sido guardado. Esperando la confirmación del otro capitán.\n🇬🇧 *Your result (${golesA}-${golesB}) has been saved. Waiting for the other captain's confirmation.*`);
        }
        saveBotState();

    } else if (customId.startsWith('admin_modificar_modal_')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const matchId = customId.replace('admin_modificar_modal_', '');
        const golesA = parseInt(fields.getTextInputValue('goles_a'));
        const golesB = parseInt(fields.getTextInputValue('goles_b'));

        if (isNaN(golesA) || isNaN(golesB)) {
            return interaction.editReply("🇪🇸 Formato de resultado inválido. Introduce solo números.\n🇬🇧 *Invalid result format. Please enter numbers only.*");
        }
        const { partido } = findMatch(matchId);
        if (!partido) {
            return interaction.editReply("🇪🇸 Error: Partido no encontrado.\n🇬🇧 *Error: Match not found.*");
        }

        partido.resultado = `${golesA}-${golesB}`;
        if (partido.status !== 'finalizado') {
            partido.status = 'finalizado';
        }
        await interaction.editReply(`✅ 🇪🇸 Resultado modificado por el administrador a ${partido.resultado}.\n🇬🇧 *Result changed by the administrator to ${partido.resultado}.*`);
        await procesarResultadoFinal(partido, interaction);
    }
}

async function procesarResultadoFinal(partido, interaction) {
    await updateMatchChannelName(partido);

    if (partido.nombreGrupo) {
        await actualizarEstadisticasYClasificacion(partido, partido.nombreGrupo, interaction.guild);
    } else {
        const esSemifinal = torneoActivo.eliminatorias.semifinales.some(p => p.matchId === partido.matchId);
        const esFinal = torneoActivo.eliminatorias.final?.matchId === partido.matchId;

        if (esSemifinal) {
            await handleSemifinalResult(interaction.guild);
        } else if (esFinal) {
            await handleFinalResult();
        }
    }
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_modificar_resultado_${partido.matchId}`).setLabel("Modificar Resultado (Admin)").setStyle(ButtonStyle.Secondary).setEmoji("✍️"));
    const channel = await client.channels.fetch(partido.channelId).catch(() => null);
    if (channel) {
        await channel.send({ content: `✅ Resultado final establecido: **${partido.equipoA.nombre} ${partido.resultado} ${partido.equipoB.nombre}**.`, components: [row]});
    }
}

function findMatch(matchId) {
    if (!torneoActivo) return { partido: null };

    const allMatches = [
        ...(Object.values(torneoActivo.calendario || {}).flat()),
        ...(torneoActivo.eliminatorias?.semifinales || []),
        ...(torneoActivo.eliminatorias?.final ? [torneoActivo.eliminatorias.final] : [])
    ];

    const partido = allMatches.find(p => p && p.matchId === matchId);
    return { partido: partido || null };
}

async function realizarSorteoDeGrupos(guild) {
    const torneo = torneoActivo;
    const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!adminChannel) { console.error("CANAL ADMIN NO ENCONTRADO"); return; }

    await adminChannel.send('Iniciando sorteo y creación de canales...');
    const category = await client.channels.fetch(CATEGORY_ID).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
        return adminChannel.send(`❌ Error Crítico: La categoría para partidos no se encuentra.`);
    }
    const inscripcionChannel = await client.channels.fetch(INSCRIPCION_CHANNEL_ID);
    if(mensajeInscripcionId) {
        try {
            const msg = await inscripcionChannel.messages.fetch(mensajeInscripcionId);
            const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(msg.components[0].components[0]).setDisabled(true));
            await msg.edit({ content: 'Las inscripciones para este torneo han finalizado.', components: [disabledRow] });
        } catch (e) { console.error("No se pudo editar el mensaje de inscripción."); }
    }
    torneo.status = 'fase_de_grupos';
    let equipos = Object.values(torneo.equipos_aprobados);
    for (let i = equipos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [equipos[i], equipos[j]] = [equipos[j], equipos[i]]; }
    const grupos = {};
    const calendario = {};
    const numGrupos = torneo.size / 4;
    for (let i = 0; i < equipos.length; i++) {
        const grupoIndex = Math.floor(i / (torneo.size / numGrupos));
        const nombreGrupo = `Grupo ${String.fromCharCode(65 + grupoIndex)}`;
        if (!grupos[nombreGrupo]) grupos[nombreGrupo] = { equipos: [] };
        equipos[i].stats = { pj: 0, pts: 0, gf: 0, gc: 0, dg: 0 };
        grupos[nombreGrupo].equipos.push(equipos[i]);
    }
    for (const nombreGrupo in grupos) {
        const equiposGrupo = grupos[nombreGrupo].equipos;
        let jornadaCounter = 1;
        for (let i = 0; i < equiposGrupo.length; i++) {
            for (let j = i + 1; j < equiposGrupo.length; j++) {
                if (!calendario[nombreGrupo]) calendario[nombreGrupo] = [];
                calendario[nombreGrupo].push({
                    matchId: `match_${Date.now()}_${i}${j}`,
                    nombreGrupo,
                    jornada: jornadaCounter++,
                    equipoA: equiposGrupo[i],
                    equipoB: equiposGrupo[j],
                    resultado: null,
                    reportedScores: {},
                    status: 'en_curso',
                    channelId: null
                });
            }
        }
    }
    torneo.grupos = grupos;
    torneo.calendario = calendario;
    torneo.eliminatorias = { semifinales: [], final: null };
    const channelName = `🏆-clasificacion-${torneo.nombre.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`;
    const gruposChannel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, topic: `Clasificación del torneo ${torneo.nombre}.` });
    torneo.canalGruposId = gruposChannel.id;
    const embedClasificacion = new EmbedBuilder().setColor('#1abc9c').setTitle(`Clasificación: ${torneo.nombre}`).setDescription('¡Mucha suerte a todos los equipos!').setTimestamp();
    const classificationMessage = await gruposChannel.send({ embeds: [embedClasificacion] });
    torneo.publicGroupsMessageId = classificationMessage.id;
    torneoActivo = torneo;
    saveBotState();
    
    await actualizarMensajeClasificacion();
    let createdCount = 0, errorCount = 0;
    for (const nombreGrupo in calendario) {
        for (const partido of calendario[nombreGrupo]) {
            try {
                await crearCanalDePartido(guild, partido, `Grupo ${nombreGrupo.slice(-1)}`);
                createdCount++;
            } catch (error) {
                errorCount++;
            }
        }
    }
    await adminChannel.send(errorCount === 0 ? `✅ Sorteo completado y todos los ${createdCount} canales de partido creados.` : `⚠️ Se crearon ${createdCount} canales, pero fallaron ${errorCount}.`);
}

async function iniciarFaseEliminatoria(guild) {
    if (!torneoActivo || torneoActivo.status !== 'fase_de_grupos') return;

    let todosPartidosFinalizados = Object.values(torneoActivo.calendario).flat().every(p => p.status === 'finalizado');
    if (!todosPartidosFinalizados) return;

    torneoActivo.status = 'semifinales';
    const clasificados = [];

    if (torneoActivo.size === 16) {
        for (const groupName in torneoActivo.grupos) {
            const grupoOrdenado = [...torneoActivo.grupos[groupName].equipos].sort((a,b) => sortTeams(a,b,groupName));
            clasificados.push(grupoOrdenado[0]);
        }
        for (let i = clasificados.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [clasificados[i], clasificados[j]] = [clasificados[j], clasificados[i]]; }
    } else { // Torneo de 8 equipos
        const grupoA = [...torneoActivo.grupos['Grupo A'].equipos].sort((a,b) => sortTeams(a,b,'Grupo A'));
        const grupoB = [...torneoActivo.grupos['Grupo B'].equipos].sort((a,b) => sortTeams(a,b,'Grupo B'));
        clasificados.push(grupoA[0], grupoB[1], grupoB[0], grupoA[1]); // 1A vs 2B, 1B vs 2A
    }

    const semifinal1 = { matchId: `match_semi_1_${Date.now()}`, equipoA: clasificados[0], equipoB: clasificados[1], resultado: null, reportedScores: {}, status: 'en_curso' };
    const semifinal2 = { matchId: `match_semi_2_${Date.now()}`, equipoA: clasificados[2], equipoB: clasificados[3], resultado: null, reportedScores: {}, status: 'en_curso' };
    torneoActivo.eliminatorias.semifinales = [semifinal1, semifinal2];

    await crearCanalDePartido(guild, semifinal1, 'Semifinal-1');
    await crearCanalDePartido(guild, semifinal2, 'Semifinal-2');
    
    saveBotState();

    const embedAnuncio = new EmbedBuilder().setColor('#e67e22').setTitle('🔥 ¡Fase de Grupos Finalizada! Comienzan las Semifinales 🔥').addFields({ name: 'Semifinal 1', value: `> ${semifinal1.equipoA.nombre} vs ${semifinal1.equipoB.nombre}` }, { name: 'Semifinal 2', value: `> ${semifinal2.equipoA.nombre} vs ${semifinal2.equipoB.nombre}` }).setFooter({text: '¡Mucha suerte a los clasificados!'});
    const clasifChannel = await client.channels.fetch(torneoActivo.canalGruposId);
    await clasifChannel.send({ embeds: [embedAnuncio] });
}

async function handleSemifinalResult(guild) {
    const semifinales = torneoActivo.eliminatorias.semifinales;
    if (semifinales.every(p => p.status === 'finalizado')) {
        const ganador1 = semifinales[0].resultado.split('-').map(Number)[0] > semifinales[0].resultado.split('-').map(Number)[1] ? semifinales[0].equipoA : semifinales[0].equipoB;
        const ganador2 = semifinales[1].resultado.split('-').map(Number)[0] > semifinales[1].resultado.split('-').map(Number)[1] ? semifinales[1].equipoA : semifinales[1].equipoB;

        const final = { matchId: `match_final_${Date.now()}`, equipoA: ganador1, equipoB: ganador2, resultado: null, reportedScores: {}, status: 'en_curso' };
        torneoActivo.eliminatorias.final = final;
        torneoActivo.status = 'final';

        await crearCanalDePartido(guild, final, 'Final');
        saveBotState();

        const embedAnuncio = new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 ¡Llegó la Gran Final! 🏆').setDescription(`**${final.equipoA.nombre} vs ${final.equipoB.nombre}**`).setFooter({text: '¡Solo uno puede ser el campeón!'});
        const clasifChannel = await client.channels.fetch(torneoActivo.canalGruposId);
        await clasifChannel.send({ embeds: [embedAnuncio] });
    }
}

// CORREGIDO: Lógica de la final ahora gestiona premio para campeón Y finalista.
async function handleFinalResult() {
    const final = torneoActivo.eliminatorias.final;
    const [golesA, golesB] = final.resultado.split('-').map(Number);
    const campeon = golesA > golesB ? final.equipoA : final.equipoB;
    const finalista = golesA > golesB ? final.equipoB : final.equipoA; // Identificamos al finalista
    torneoActivo.status = 'terminado';
    saveBotState();

    const embedCampeon = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle(`🎉 ¡Tenemos un Campeón! / We Have a Champion! 🎉`)
        .setDescription(`**¡Felicidades a ${campeon.nombre} por ganar el torneo ${torneoActivo.nombre}!**\n\n**Congratulations to ${campeon.nombre} for winning the ${torneoActivo.nombre} tournament!**`)
        .setThumbnail('https://i.imgur.com/C5mJg1s.png')
        .setTimestamp();

    const clasifChannel = await client.channels.fetch(torneoActivo.canalGruposId);
    await clasifChannel.send({ content: `|| @everyone ||`, embeds: [embedCampeon] });

    if (torneoActivo.isPaid) {
        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
        if(adminChannel) {
            // Embed para el CAMPEÓN
            const paymentEmbedCampeon = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🏆 Tarea de Admin: Pagar Premio al CAMPEÓN')
                .addFields(
                    { name: 'Equipo Ganador', value: campeon.nombre },
                    { name: 'Capitán', value: campeon.capitanTag },
                    { name: 'PayPal del Capitán', value: `\`${campeon.paypal || 'No proporcionado'}\`` },
                    { name: 'Monto a Pagar', value: `${torneoActivo.prizeCampeon}€` }
                )
                .setTimestamp();

            const rowCampeon = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_confirm_payment_campeon_${campeon.id}`).setLabel('Confirmar Pago a Campeón').setStyle(ButtonStyle.Success).setEmoji('✅')
            );
            if (campeon.paypal) {
                const paymentLink = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(campeon.paypal)}&amount=${torneoActivo.prizeCampeon}¤cy_code=EUR`;
                rowCampeon.addComponents(new ButtonBuilder().setLabel('Pagar con PayPal').setStyle(ButtonStyle.Link).setURL(paymentLink).setEmoji('💸'));
            }
            await adminChannel.send({ content: `<@&${ARBITRO_ROLE_ID}>`, embeds: [paymentEmbedCampeon], components: [rowCampeon] });
            
            // Embed para el FINALISTA
            const paymentEmbedFinalista = new EmbedBuilder()
                .setColor('#C0C0C0') // Color plata
                .setTitle('🥈 Tarea de Admin: Pagar Premio al FINALISTA')
                .addFields(
                    { name: 'Equipo Finalista', value: finalista.nombre },
                    { name: 'Capitán', value: finalista.capitanTag },
                    { name: 'PayPal del Capitán', value: `\`${finalista.paypal || 'No proporcionado'}\`` },
                    { name: 'Monto a Pagar', value: `${torneoActivo.prizeFinalista}€` }
                )
                .setTimestamp();

            const rowFinalista = new ActionRowBuilder().addComponents(
                 new ButtonBuilder().setCustomId(`admin_confirm_payment_finalista_${finalista.id}`).setLabel('Confirmar Pago a Finalista').setStyle(ButtonStyle.Success).setEmoji('✅')
            );
             if (finalista.paypal) {
                const paymentLink = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(finalista.paypal)}&amount=${torneoActivo.prizeFinalista}¤cy_code=EUR`;
                rowFinalista.addComponents(new ButtonBuilder().setLabel('Pagar con PayPal').setStyle(ButtonStyle.Link).setURL(paymentLink).setEmoji('💸'));
            }
            await adminChannel.send({ embeds: [paymentEmbedFinalista], components: [rowFinalista] });
        }
    }
}

async function actualizarEstadisticasYClasificacion(partido, nombreGrupo, guild) {
    const [golesA, golesB] = partido.resultado.split('-').map(Number);
    const equipoA = torneoActivo.grupos[nombreGrupo].equipos.find(e => e.id === partido.equipoA.id);
    const equipoB = torneoActivo.grupos[nombreGrupo].equipos.find(e => e.id === partido.equipoB.id);

    equipoA.stats.pj += 1;
    equipoB.stats.pj += 1;
    equipoA.stats.gf += golesA;
    equipoB.stats.gf += golesB;
    equipoA.stats.gc += golesB;
    equipoB.stats.gc += golesA;
    equipoA.stats.dg = equipoA.stats.gf - equipoA.stats.gc;
    equipoB.stats.dg = equipoB.stats.gf - equipoB.stats.gc;

    if (golesA > golesB) {
        equipoA.stats.pts += 3;
    } else if (golesB > golesA) {
        equipoB.stats.pts += 3;
    } else {
        equipoA.stats.pts += 1;
        equipoB.stats.pts += 1;
    }
    
    saveBotState();

    await actualizarMensajeClasificacion();
    await iniciarFaseEliminatoria(guild);
}

function sortTeams(a, b, groupName) {
    if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
    if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
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
            const teamName = e.nombre.padEnd(nameWidth);
            const pj = e.stats.pj.toString().padStart(2);
            const pts = e.stats.pts.toString().padStart(3);
            const gf = e.stats.gf.toString().padStart(3);
            const gc = e.stats.gc.toString().padStart(3);
            const dgVal = e.stats.dg;
            const dg = (dgVal >= 0 ? '+' : '') + dgVal.toString();
            const paddedDg = dg.padStart(4);

            return `${teamName}${pj}  ${pts}  ${gf}  ${gc} ${paddedDg}`;
        }).join('\n');

        newEmbed.addFields({ name: `**${groupName}**`, value: "```\n" + header + "\n" + table + "\n```" });
    }
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

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Error al obtener reacción parcial:', error);
            return;
        }
    }
    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
        } catch (error) {
            console.error('Error al obtener mensaje parcial:', error);
            return;
        }
    }

    if (!reaction.message.embeds[0] || reaction.message.embeds[0].title !== LANGUAGE_SETUP_TITLE) {
        return;
    }

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

        if (!roleToAdd) {
            console.warn(`[ADVERTENCIA] El rol de idioma "${newRoleName}" no fue encontrado en el servidor.`);
            return;
        }
        
        if (member.roles.cache.has(roleToAdd.id)) {
            return;
        }

        const rolesToRemove = [];
        for (const flag in languageRoles) {
            const roleNameToRemove = languageRoles[flag].name;
            const role = guild.roles.cache.find(r => r.name === roleNameToRemove);
            if (role && member.roles.cache.has(role.id)) {
                rolesToRemove.push(role);
            }
        }
        
        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove, 'Cambiando rol de idioma por reacción.');
        }

        await member.roles.add(roleToAdd, 'Asignando rol de idioma por reacción.');

    } catch (error) {
        console.error('Error al asignar rol por reacción:', error);
    }
});

async function handleSetupCommand(message) {
    const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle(LANGUAGE_SETUP_TITLE) 
        .setDescription('Reacciona a tu bandera para traducir tus mensajes.\n*React with your flag to have your messages translated.*')
        .addFields(Object.values(languageRoles).map(role => ({ name: `${Object.keys(languageRoles).find(key => languageRoles[key] === role)} ${role.name}`, value: ``, inline: true })))
        .setFooter({ text: 'Solo puedes tener un rol de idioma.' });
    try {
        const sentMessage = await message.channel.send({ embeds: [embed] });
        for (const flag in languageRoles) { await sentMessage.react(flag); }
        await message.delete();
    } catch (error) { console.error('Error al enviar setup:', error); }
}

keepAlive();

client.login(process.env.DISCORD_TOKEN);
