// VERSIÓN FINAL 2.0 - Corregido el error de "Interaction Acknowledged" y otras mejoras.
require('dotenv').config();

const keepAlive = require('./keep_alive.js');

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { translate } = require('@vitalets/google-translate-api');

// --- "BASE DE DATOS" EN MEMORIA ---
let torneoActivo = null;
let mensajeInscripcionId = null;
let listaEquiposMessageId = null;

// --- CONFIGURACIÓN (REVISA QUE ESTOS IDS SEAN CORRECTOS) ---
const ADMIN_CHANNEL_ID = '1393187598796587028';
const CATEGORY_ID = '1393225162584883280';
const ARBITRO_ROLE_ID = '1393505777443930183';
const CAPITAN_ROLE_ID = '1394321301748977684';
const INSCRIPCION_CHANNEL_ID = '1393942335645286412';
const SETUP_COMMAND = '!setup-idiomas';

// --- DATOS DE IDIOMAS Y NORMAS ---
const languageRoles = {
    '🇪🇸': { name: 'Español', code: 'es' }, '🇮🇹': { name: 'Italiano', code: 'it' }, '🇬🇧': { name: 'English', code: 'en' },
    '🇫🇷': { name: 'Français', code: 'fr' }, '🇵🇹': { name: 'Português', code: 'pt' }, '🇩🇪': { name: 'Deutsch', code: 'de' },
    '🇹🇷': { name: 'Türkçe', code: 'tr' }
};

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
            new ButtonBuilder().setCustomId(`reportar_resultado_v3_${partido.matchId}`).setLabel("Reportar Resultado").setStyle(ButtonStyle.Primary).setEmoji("📊"),
            new ButtonBuilder().setCustomId(`aportar_prueba_${partido.matchId}`).setLabel("Aportar Prueba (Vídeo)").setStyle(ButtonStyle.Secondary).setEmoji("📹"),
            new ButtonBuilder().setCustomId(`solicitar_arbitraje_${partido.matchId}`).setLabel("Solicitar Arbitraje").setStyle(ButtonStyle.Danger).setEmoji("⚠️")
        );
        
        await channel.send({ content: `<@${partido.equipoA.capitanId}> y <@${partido.equipoB.capitanId}>`, embeds: [embed], components: [actionButtons] });
        console.log(`[INFO] Canal de partido creado: ${channel.name}`);
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
        if(interaction) await interaction.followUp({ content: 'Error: Canal de inscripción no encontrado.', ephemeral: true });
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
        if (error.code === 10062) { // Interaction has already been acknowledged
            console.warn(`[WARN] Interacción expirada (token inválido). El bot tardó demasiado en responder. Esto es normal en cold starts y se ignora.`);
            return;
        }
        console.error('Ha ocurrido un error en el manejador de interacciones:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '🇪🇸 Hubo un error al procesar tu solicitud.\n🇬🇧 *An error occurred while processing your request.*', ephemeral: true }).catch(()=>{});
            } else {
                await interaction.followUp({ content: '🇪🇸 Hubo un error al procesar tu solicitud.\n🇬🇧 *An error occurred while processing your request.*', ephemeral: true }).catch(()=>{});
            }
        } catch (e) {
            console.error('Error al enviar mensaje de error de interacción:', e);
        }
    }
});

async function handleSlashCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply({ content: '🇪🇸 No tienes permisos para usar este comando.\n🇬🇧 You do not have permission to use this command.' });
    }
    const { commandName } = interaction;
    if (commandName === 'panel-admin') {
        const embed = new EmbedBuilder().setColor('#2c3e50').setTitle('Panel de Control del Torneo').setDescription('🇪🇸 Usa los botones de abajo para gestionar el torneo.\n🇬🇧 Use the buttons below to manage the tournament.');
        const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_crear').setLabel('Crear Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆'), new ButtonBuilder().setCustomId('panel_add_test').setLabel('Añadir Equipos Prueba').setStyle(ButtonStyle.Secondary).setEmoji('🧪'));
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_simular_partidos').setLabel('Simular Partidos').setStyle(ButtonStyle.Primary).setEmoji('🎲'), new ButtonBuilder().setCustomId('panel_borrar_canales').setLabel('Borrar Canales Partido').setStyle(ButtonStyle.Danger).setEmoji('🗑️'), new ButtonBuilder().setCustomId('panel_finalizar').setLabel('Finalizar Torneo').setStyle(ButtonStyle.Danger).setEmoji('🛑'));
        await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
        return interaction.editReply({ content: 'Panel de control creado.' });
    }
    
    if (commandName === 'sortear-grupos') {
        const torneo = torneoActivo;
        if (!torneo) return interaction.editReply({ content: 'No hay ningún torneo activo para sortear.' });
        if (torneo.status === 'fase_de_grupos') return interaction.editReply({ content: 'El torneo ya ha sido sorteado.' });
        const equiposAprobadosCount = Object.keys(torneo.equipos_aprobados || {}).length;
        if (equiposAprobadosCount < torneo.size) return interaction.editReply({ content: `No hay suficientes equipos. Se necesitan ${torneo.size} y hay ${equiposAprobadosCount}.` });
        await interaction.editReply({ content: 'Iniciando sorteo manualmente...' });
        await realizarSorteoDeGrupos(interaction.guild);
        return;
    }
    
    if (commandName === 'iniciar-eliminatorias') {
        await iniciarFaseEliminatoria(interaction.guild);
        await interaction.editReply({ content: 'Fase eliminatoria iniciada.'});
    }
}

async function handleButton(interaction) {
    const { customId } = interaction;

    // --- LÓGICA DE DIFERIR RESPUESTAS ---
    // Si la interacción es un modal, no se difiere aquí, sino en el 'handleModalSubmit'.
    // Si es una acción directa, se difiere aquí.
    const isModalButton = ['inscribir_equipo_btn', 'pago_realizado_btn'].includes(customId) || customId.startsWith('reportar_resultado_v3_') || customId.startsWith('aportar_prueba_') || customId.startsWith('admin_modificar_resultado_');

    if (!isModalButton) {
        await interaction.deferReply({ ephemeral: true });
    }

    // --- LÓGICA DE BOTONES ---

    if (customId.startsWith('panel_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.editReply({ content: 'No tienes permisos para usar los botones del panel.' });
        }
        const [panel, type, subtype] = customId.split('_');
        if (type === 'crear') {
            const sizeMenu = new StringSelectMenuBuilder()
                .setCustomId('crear_torneo_size_select')
                .setPlaceholder('Paso 1: Selecciona el tamaño del torneo')
                .addOptions([
                    { label: '8 Equipos', description: '2 grupos, clasifican los 2 primeros.', value: '8' },
                    { label: '16 Equipos', description: '4 grupos, clasifica el primero.', value: '16' },
                ]);
            const row = new ActionRowBuilder().addComponents(sizeMenu);
            await interaction.editReply({ content: 'Iniciando creación de torneo...', components: [row] });
        } else if (type === 'add' && subtype === 'test') {
            const modal = new ModalBuilder().setCustomId('add_test_modal').setTitle('Añadir Equipos de Prueba');
            const cantidadInput = new TextInputBuilder().setCustomId('cantidad_input').setLabel("¿Cuántos equipos de prueba quieres añadir?").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(cantidadInput));
            await interaction.showModal(modal); // No se necesita defer/edit para showModal
        
        } else if (type === 'simular' && subtype === 'partidos') {
            if (!torneoActivo || torneoActivo.status !== 'fase_de_grupos') {
                 return interaction.editReply({ content: 'Solo se pueden simular partidos durante la fase de grupos.' });
            }
        
            let partidosSimulados = 0;
            const todosLosPartidosDeGrupos = Object.values(torneoActivo.calendario).flat(2);
        
            for (const partido of todosLosPartidosDeGrupos) {
                if (partido.status !== 'finalizado') {
                    const golesA = Math.floor(Math.random() * 5);
                    const golesB = Math.floor(Math.random() * 5);
                    partido.resultado = `${golesA}-${golesB}`;
                    partido.status = 'finalizado';
                    partidosSimulados++;
                    if (partido.channelId) {
                        await updateMatchChannelName(partido);
                    }
                }
            }
            
            for(const groupName in torneoActivo.grupos) {
                for (const equipo of torneoActivo.grupos[groupName].equipos) {
                    equipo.stats = { pj: 0, pts: 0, gf: 0, gc: 0, dg: 0 };
                }
            }
            for (const partido of todosLosPartidosDeGrupos) {
                const [golesA, golesB] = partido.resultado.split('-').map(Number);
                const nombreGrupo = partido.nombreGrupo;
                const equipoA = torneoActivo.grupos[nombreGrupo].equipos.find(e => e.id === partido.equipoA.id);
                const equipoB = torneoActivo.grupos[nombreGrupo].equipos.find(e => e.id === partido.equipoB.id);

                if (equipoA && equipoB) {
                    equipoA.stats.pj++;
                    equipoB.stats.pj++;
                    equipoA.stats.gf += golesA;
                    equipoB.stats.gf += golesB;
                    equipoA.stats.gc += golesB;
                    equipoB.stats.gc += golesA;
                    if (golesA > golesB) equipoA.stats.pts += 3;
                    else if (golesB > golesA) equipoB.stats.pts += 3;
                    else {
                        equipoA.stats.pts++;
                        equipoB.stats.pts++;
                    }
                    equipoA.stats.dg = equipoA.stats.gf - equipoA.stats.gc;
                    equipoB.stats.dg = equipoB.stats.gf - equipoB.stats.gc;
                }
            }
            
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
            await interaction.followUp({ content: `✅ ${deletedCount} canales de partido borrados.`, ephemeral: true });
        } else if (type === 'finalizar') {
            if (!torneoActivo) return interaction.editReply({ content: 'No hay ningún torneo activo para finalizar.' });
            await interaction.editReply({ content: 'Finalizando torneo...' });
            await limpiarCanal(INSCRIPCION_CHANNEL_ID);
            if (torneoActivo.canalEquiposId) { const c = await client.channels.fetch(torneoActivo.canalEquiposId).catch(()=>null); if(c) await c.delete(); }
            if (torneoActivo.canalGruposId) { const c = await client.channels.fetch(torneoActivo.canalGruposId).catch(()=>null); if(c) await c.delete(); }
            const allChannels = await interaction.guild.channels.fetch();
            const matchChannels = allChannels.filter(c => c.parentId === CATEGORY_ID);
            for (const channel of matchChannels.values()) { await channel.delete('Finalización de torneo.').catch(err => {}); }
            torneoActivo = null; mensajeInscripcionId = null; listaEquiposMessageId = null;
            await mostrarMensajeEspera(interaction);
            await interaction.followUp({ content: '✅ Torneo finalizado y todos los canales reseteados.', ephemeral: true });
        }
        return;
    }

    else if (customId.startsWith('rules_')) {
        //... Código idéntico ...
    }

    else if (customId.startsWith('lang_select_')) {
        //... Código idéntico ...
    }
    
    // --- LÓGICA DE BOTONES QUE ABREN MODALES ---
    if (isModalButton) {
        if (customId === 'inscribir_equipo_btn') {
            const torneo = torneoActivo;
            if (!torneo || torneo.status !== 'inscripcion_abierta') return interaction.reply({ content: '🇪🇸 Las inscripciones no están abiertas.\n🇬🇧 *Registrations are not open.*', ephemeral: true });
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
            if(!partido) return interaction.reply({content: "Error: No se pudo encontrar el partido para este botón. El torneo puede haber finalizado.", ephemeral: true });
            const modal = new ModalBuilder().setCustomId(`reportar_resultado_modal_${matchId}`).setTitle('Reportar Resultado');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
            await interaction.showModal(modal);
        
        } else if (customId.startsWith('aportar_prueba_')) {
            const matchId = customId.replace('aportar_prueba_', '');
            const modal = new ModalBuilder().setCustomId(`modal_aportar_prueba_${matchId}`).setTitle('Aportar Prueba de Vídeo');
            const videoLinkInput = new TextInputBuilder().setCustomId('video_link').setLabel("Pega el enlace del vídeo (YouTube, etc.)").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(videoLinkInput));
            await interaction.showModal(modal);

        } else if (customId.startsWith('admin_modificar_resultado_')) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: 'No tienes permisos.', ephemeral: true });
            const matchId = customId.replace('admin_modificar_resultado_', '');
            const { partido } = findMatch(matchId);
            if (!partido) return interaction.reply({ content: "Error: No se pudo encontrar el partido.", ephemeral: true });
            const modal = new ModalBuilder().setCustomId(`admin_modificar_modal_${matchId}`).setTitle('Modificar Resultado (Admin)');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[0] : '0');
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[1] : '0');
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
            await interaction.showModal(modal);
        }
    } else if (customId.startsWith('solicitar_arbitraje_')) {
        const matchId = customId.replace('solicitar_arbitraje_', '');
        const { partido } = findMatch(matchId);
        if(!partido) return interaction.editReply({content: "🇪🇸 Error: No se pudo encontrar el partido.\n🇬🇧 *Error: Match not found.*" });
        
        partido.status = 'arbitraje';
        await updateMatchChannelName(partido);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_modificar_resultado_${matchId}`).setLabel("Modificar Resultado (Admin)").setStyle(ButtonStyle.Secondary).setEmoji("✍️"));
        await interaction.channel.send({ content: `<@&${ARBITRO_ROLE_ID}> 🇪🇸 Se ha solicitado arbitraje en este partido.\n🇬🇧 *A referee has been requested for this match.*`, components: [row] });
        await interaction.editReply({ content: "Solicitud de arbitraje enviada."})

    } else if (customId.startsWith('admin_aprobar_') || customId.startsWith('admin_rechazar_') || customId.startsWith('admin_expulsar_')) {
        const [action, type, captainId] = customId.split('_');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.editReply({ content: 'No tienes permisos.' });
        
        if (type === 'expulsar') {
            // ... (código sin cambios)
        } else {
            const equipoPendiente = torneoActivo.equipos_pendientes[captainId];
            if (!equipoPendiente) return interaction.editReply({ content: 'Este equipo ya no está pendiente.' });
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
                newEmbed.setColor('#2ECC71').setTitle('✅ EQUIPO APROBADO').addFields({ name: 'Aprobado por', value: interaction.user.tag });
                newButtons.addComponents(new ButtonBuilder().setCustomId(`admin_expulsar_${captainId}`).setLabel('Expulsar Equipo').setStyle(ButtonStyle.Danger).setEmoji('✖️'));
                
                if (captainMember) {
                    const capitanRole = await interaction.guild.roles.fetch(CAPITAN_ROLE_ID).catch(() => null);
                    if (capitanRole) {
                        await captainMember.roles.add(capitanRole);
                        console.log(`[INFO] Rol 'Capitán Torneo' asignado a ${captainMember.user.tag}`);
                    } else {
                        console.warn(`[ADVERTENCIA] No se encontró el rol de Capitán con ID ${CAPITAN_ROLE_ID}.`);
                        await interaction.followUp({ content: `⚠️ Atención: El equipo fue aprobado, pero no se pudo encontrar el rol "Capitán Torneo" para asignarlo.`, ephemeral: true });
                    }
                }
                
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
                    await interaction.followUp({ content: `¡Cupo de ${torneoActivo.size} equipos lleno! Iniciando sorteo...`, ephemeral: true });
                    await realizarSorteoDeGrupos(interaction.guild);
                }
            } else {
                // Lógica de rechazar...
            }
        }
    } else if (customId.startsWith('admin_confirm_payment_')) {
        // ... (código sin cambios)
    }
}


// --- Resto del código (handleSelectMenu en adelante) ---

async function handleSelectMenu(interaction) {
    if (interaction.customId.startsWith('crear_torneo_')) {
        await interaction.deferUpdate(); // Solo actualiza la interfaz sin mostrar nada
    }

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
        await interaction.editReply({ content: `Tamaño seleccionado: **${size} equipos**. Ahora, selecciona el tipo de torneo:`, components: [row] });
    } else if (interaction.customId.startsWith('crear_torneo_type_select_')) {
        const size = interaction.customId.split('_').pop();
        const type = interaction.values[0];
        const modal = new ModalBuilder().setCustomId(`crear_torneo_final_${size}_${type}`).setTitle('Finalizar Creación de Torneo');
        const nombreInput = new TextInputBuilder().setCustomId('torneo_nombre').setLabel("Nombre del Torneo").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(nombreInput));
        if (type === 'pago') {
            const paypalInput = new TextInputBuilder().setCustomId('torneo_paypal').setLabel("Enlace de PayPal.Me").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(paypalInput));
        }
        await interaction.showModal(modal);
    }
}

async function handleModalSubmit(interaction) {
    // --- CAMBIO CLAVE: Diferir respuesta en todos los modales que hacen tareas pesadas ---
    await interaction.deferReply({ ephemeral: true });

    const { customId, fields } = interaction;

    if (customId.startsWith('crear_torneo_final_')) {
        const [, , , sizeStr, type] = customId.split('_');
        const size = parseInt(sizeStr);
        const isPaid = type === 'pago';
        const nombre = fields.getTextInputValue('torneo_nombre');
        const enlacePaypal = isPaid ? fields.getTextInputValue('torneo_paypal') : null;
        if (isPaid && !enlacePaypal) {
            return interaction.editReply({ content: 'Debes proporcionar un enlace de PayPal para un torneo de pago.' });
        }
        const inscripcionChannel = await client.channels.fetch(INSCRIPCION_CHANNEL_ID).catch(() => null);
        if (!inscripcionChannel) {
            return interaction.editReply({ content: `❌ **Error:** No se puede encontrar el canal de inscripciones.`});
        }
        await limpiarCanal(INSCRIPCION_CHANNEL_ID);
        
        const channelName = `📝-equipos-${nombre.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`;
        const equiposChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            topic: `Lista de equipos del torneo ${nombre}.`,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                    deny: [PermissionsBitField.Flags.SendMessages]
                },
                {
                    id: client.user.id,
                    allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks]
                }
            ]
        });

        let prize = 0;
        if(isPaid) {
            prize = size === 8 ? 160 : 360;
        }
        torneoActivo = { nombre, size, isPaid, prize, status: 'inscripcion_abierta', enlace_paypal: enlacePaypal, equipos_pendientes: {}, equipos_aprobados: {}, canalEquiposId: equiposChannel.id };
        let prizeText = isPaid ? `**Precio:** 25€ por equipo / *per team*\n**Premio:** ${prize}€ / **Prize:** €${prize}` : '**Precio:** Gratis / *Free*';
        const embed = new EmbedBuilder().setColor('#5865F2').setTitle(`🏆 Inscripciones Abiertas: ${nombre}`).setDescription(`Para participar, haz clic abajo.\n*To participate, click below.*\n\n${prizeText}\n\n**Límite:** ${size} equipos.`);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('inscribir_equipo_btn').setLabel('Inscribir Equipo / Register Team').setStyle(ButtonStyle.Success).setEmoji('📝'));
        const newMessage = await inscripcionChannel.send({ embeds: [embed], components: [row] });
        mensajeInscripcionId = newMessage.id;
        const embedLista = new EmbedBuilder().setColor('#3498db').setTitle(`Equipos Inscritos - ${nombre}`).setDescription('Aún no hay equipos.').setFooter({ text: `Total: 0 / ${size}` });
        const listaMsg = await equiposChannel.send({ embeds: [embedLista] });
        listaEquiposMessageId = listaMsg.id;
        await interaction.editReply({ content: `✅ Torneo "${nombre}" (${size} equipos, ${isPaid ? 'de Pago' : 'Gratis'}) creado. Canal de equipos: ${equiposChannel}.` });
    
    } else if (customId === 'inscripcion_modal') {
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

        if (!torneoActivo || torneoActivo.status !== 'inscripcion_abierta') return interaction.editReply('🇪🇸 Las inscripciones no están abiertas.\n🇬🇧 *Registrations are not open.*');
        if (Object.keys(torneoActivo.equipos_aprobados || {}).length >= torneoActivo.size) return interaction.editReply('🇪🇸 El cupo está lleno.\n🇬🇧 *The registration limit is full.*');
        if ((torneoActivo.equipos_pendientes || {})[interaction.user.id] || (torneoActivo.equipos_aprobados || {})[interaction.user.id]) return interaction.editReply('🇪🇸 Ya estás inscrito.\n🇬🇧 *You are already registered.*');
        if (!torneoActivo.equipos_pendientes) torneoActivo.equipos_pendientes = {};

        torneoActivo.equipos_pendientes[interaction.user.id] = { nombre: teamName, capitanTag: interaction.user.tag, capitanId: interaction.user.id };

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
        const paypalInfo = fields.getTextInputValue('paypal_info_input');
        const pendingTeamData = (torneoActivo.equipos_pendientes || {})[interaction.user.id];
        if (!pendingTeamData) return interaction.editReply({ content: '🇪🇸 No encontré tu inscripción pendiente.\n🇬🇧 *Could not find your pending registration.*' });

        pendingTeamData.paypal = paypalInfo;

        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
        if (adminChannel) {
            const adminEmbed = new EmbedBuilder().setColor('#e67e22').setTitle('🔔 Notificación de Pago').addFields({ name: 'Equipo', value: pendingTeamData.nombre, inline: true }, { name: 'Capitán', value: interaction.user.tag, inline: true }, { name: 'PayPal Indicado', value: paypalInfo, inline: false });
            const adminButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_aprobar_${interaction.user.id}`).setLabel('Aprobar').setStyle(ButtonStyle.Success).setEmoji('✅'), new ButtonBuilder().setCustomId(`admin_rechazar_${interaction.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger).setEmoji('❌'));
            await adminChannel.send({ embeds: [adminEmbed], components: [adminButtons] });
        }
        await interaction.editReply({ content: '✅ 🇪🇸 ¡Gracias! Un administrador ha sido notificado.\n🇬🇧 *Thank you! An administrator has been notified.*' });
    } else if (customId === 'add_test_modal') {
        const cantidad = parseInt(fields.getTextInputValue('cantidad_input'));
        if (isNaN(cantidad) || cantidad <= 0) return interaction.editReply('Número inválido.');
        if (!torneoActivo) return interaction.editReply('Primero crea un torneo.');
        if (!torneoActivo.equipos_aprobados) torneoActivo.equipos_aprobados = {};
        const capitanDePruebaId = interaction.user.id;
        const capitanDePruebaTag = interaction.user.tag;
        const initialCount = Object.keys(torneoActivo.equipos_aprobados).length;
        for (let i = 0; i < cantidad; i++) {
            const teamId = `prueba_${Date.now()}_${i}`;
            const nombreEquipo = `E-Prueba-${initialCount + i + 1}`;
            torneoActivo.equipos_aprobados[teamId] = { id: teamId, nombre: nombreEquipo, capitanId: capitanDePruebaId, capitanTag: capitanDePruebaTag, bandera: '🧪', paypal: 'admin@test.com' };
        }
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
    } else if (customId.startsWith('admin_modificar_modal_')) {
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
    
    } else if (customId.startsWith('modal_aportar_prueba_')) {
        const videoLink = fields.getTextInputValue('video_link');
        
        const embedPrueba = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('📹 Nueva Prueba Aportada')
            .setDescription(`El usuario ${interaction.user.tag} ha aportado un vídeo como prueba.\n\n**Enlace:** ${videoLink}`)
            .setTimestamp();
            
        await interaction.channel.send({
            content: `<@&${ARBITRO_ROLE_ID}>`,
            embeds: [embedPrueba]
        });
        
        await interaction.editReply({ content: '✅ Tu prueba ha sido enviada al canal del partido.' });
    }
}

async function procesarResultadoFinal(partido, interaction) {
    await updateMatchChannelName(partido);

    if (partido.nombreGrupo) {
        await actualizarEstadisticasYClasificacion(partido);
        await verificarYCrearSiguientePartido(partido.equipoA.id, partido.equipoB.id, interaction.guild);
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
        ...(Object.values(torneoActivo.calendario || {}).flat(2)),
        ...(torneoActivo.eliminatorias?.semifinales || []),
        ...(torneoActivo.eliminatorias?.final ? [torneoActivo.eliminatorias.final] : [])
    ];

    const partido = allMatches.find(p => p && p.matchId === matchId);
    return { partido: partido || null };
}

async function verificarYCrearSiguientePartido(equipoId1, equipoId2, guild) {
    if (!torneoActivo || torneoActivo.status !== 'fase_de_grupos') return;

    for (const equipoId of [equipoId1, equipoId2]) {
        let equipoActual, nombreGrupoDelEquipo;
        for (const groupName in torneoActivo.grupos) {
            const equipoEncontrado = torneoActivo.grupos[groupName].equipos.find(e => e.id === equipoId);
            if (equipoEncontrado) {
                equipoActual = equipoEncontrado;
                nombreGrupoDelEquipo = groupName;
                break;
            }
        }
        if (!equipoActual) continue;

        const calendarioDelGrupo = torneoActivo.calendario[nombreGrupoDelEquipo].flat();
        const siguientePartido = calendarioDelGrupo.find(p =>
            (p.equipoA.id === equipoId || p.equipoB.id === equipoId) && p.status === 'pendiente'
        );

        if (!siguientePartido) continue;

        const oponente = siguientePartido.equipoA.id === equipoId ? siguientePartido.equipoB : siguientePartido.equipoA;

        const oponenteOcupado = calendarioDelGrupo.some(p =>
            (p.equipoA.id === oponente.id || p.equipoB.id === oponente.id) && p.status === 'en_curso'
        );

        if (!oponenteOcupado) {
            console.log(`[INFO] Ambos equipos (${equipoActual.nombre} y ${oponente.nombre}) están listos. Creando canal para su partido.`);
            siguientePartido.status = 'en_curso';
            await crearCanalDePartido(guild, siguientePartido, `Grupo ${nombreGrupoDelEquipo.slice(-1)}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const todosPartidosFinalizados = Object.values(torneoActivo.calendario).flat(2).every(p => p.status === 'finalizado');
    if (todosPartidosFinalizados) {
        console.log('[INFO] ¡Toda la fase de grupos ha terminado! Iniciando eliminatorias...');
        await iniciarFaseEliminatoria(guild);
    }
}

async function realizarSorteoDeGrupos(guild) {
    // ... (El resto de la función es idéntica a la versión anterior) ...
}

async function iniciarFaseEliminatoria(guild) {
    // ... (El resto de la función es idéntica a la versión anterior) ...
}

async function handleSemifinalResult(guild) {
    // ... (El resto de la función es idéntica a la versión anterior) ...
}

async function handleFinalResult() {
    // ... (El resto de la función es idéntica a la versión anterior) ...
}

async function actualizarEstadisticasYClasificacion(partido) {
    // ... (El resto de la función es idéntica a la versión anterior) ...
}

function sortTeams(a, b, groupName) {
    // ... (El resto de la función es idéntica a la versión anterior) ...
}

async function actualizarMensajeClasificacion() {
    // ... (El resto de la función es idéntica a la versión anterior) ...
}

client.on('messageCreate', async message => {
    // ... (El resto de la función es idéntica a la versión anterior) ...
});

async function handleSetupCommand(message) {
    // ... (El resto de la función es idéntica a la versión anterior) ...
}

keepAlive();

client.login(process.env.DISCORD_TOKEN);
