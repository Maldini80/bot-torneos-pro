// VERSIÓN 5.0 - CON BASE DE DATOS PERSISTENTE
require('dotenv').config();

const keepAlive = require('./keep_alive.js');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { translate } = require('@vitalets/google-translate-api');
const Keyv = require('@keyv/json');

// --- BASE DE DATOS PERSISTENTE ---
const db = new Keyv({ uri: 'file://database.json' });

// --- CONFIGURACIÓN (REVISA QUE ESTOS IDS SEAN CORRECTOS) ---
const ADMIN_CHANNEL_ID = '1393187598796587028';
const CATEGORY_ID = '1393225162584883280';
const ARBITRO_ROLE_ID = '1393505777443930183';
const CAPITAN_ROLE_ID = '1394321301748977684';
const INSCRIPCION_CHANNEL_ID = '1393942335645286412';
const SETUP_COMMAND = '!setup-idiomas';

// --- DATOS DE IDIOMAS ---
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
    const torneoActivo = await db.get('torneo');
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
        if (error.code === 10062 || error.code === 10008) {
            console.warn(`[WARN] Se intentó responder a una interacción ya respondida/expirada. Se ignora.`);
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
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '🇪🇸 No tienes permisos para usar este comando.\n🇬🇧 You do not have permission to use this command.', ephemeral: true });
    }

    const { commandName } = interaction;
    await interaction.deferReply({ ephemeral: true });

    if (commandName === 'panel-admin') {
        const embed = new EmbedBuilder().setColor('#2c3e50').setTitle('Panel de Control del Torneo').setDescription('🇪🇸 Usa los botones de abajo para gestionar el torneo.\n🇬🇧 Use the buttons below to manage the tournament.');
        const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_crear').setLabel('Crear Torneo').setStyle(ButtonStyle.Success).setEmoji('🏆'), new ButtonBuilder().setCustomId('panel_add_test').setLabel('Añadir Equipos Prueba').setStyle(ButtonStyle.Secondary).setEmoji('🧪'));
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_simular_partidos').setLabel('Simular Partidos').setStyle(ButtonStyle.Primary).setEmoji('🎲'), new ButtonBuilder().setCustomId('panel_borrar_canales').setLabel('Borrar Canales Partido').setStyle(ButtonStyle.Danger).setEmoji('🗑️'), new ButtonBuilder().setCustomId('panel_finalizar').setLabel('Finalizar Torneo').setStyle(ButtonStyle.Danger).setEmoji('🛑'));
        await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
        return interaction.editReply({ content: 'Panel de control creado.' });
    }
    
    if (commandName === 'sortear-grupos') {
        const torneoActivo = await db.get('torneo');
        if (!torneoActivo) return interaction.editReply({ content: 'No hay ningún torneo activo para sortear.' });
        if (torneoActivo.status === 'fase_de_grupos') return interaction.editReply({ content: 'El torneo ya ha sido sorteado.' });
        const equiposAprobadosCount = Object.keys(torneoActivo.equipos_aprobados || {}).length;
        if (equiposAprobadosCount < torneoActivo.size) return interaction.editReply({ content: `No hay suficientes equipos. Se necesitan ${torneo.size} y hay ${equiposAprobadosCount}.` });
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
    const isModalButton = ['inscribir_equipo_btn', 'pago_realizado_btn'].includes(customId) || customId.startsWith('reportar_resultado_v3_') || customId.startsWith('aportar_prueba_') || customId.startsWith('admin_modificar_resultado_') || customId.startsWith('panel_add_test');

    if (!isModalButton) {
        await interaction.deferReply({ ephemeral: true });
    }

    if (customId.startsWith('panel_')) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.followUp({ content: 'No tienes permisos para usar los botones del panel.', ephemeral: true });
        }
        const [panel, type, subtype] = customId.split('_');
        if (type === 'crear') {
            const sizeMenu = new StringSelectMenuBuilder()
                .setCustomId('crear_torneo_size_select')
                .setPlaceholder('Paso 1: Selecciona el tamaño del torneo')
                .addOptions([{ label: '8 Equipos', value: '8' }, { label: '16 Equipos', value: '16' }]);
            const row = new ActionRowBuilder().addComponents(sizeMenu);
            await interaction.editReply({ content: 'Iniciando creación de torneo...', components: [row] });
        } else if (type === 'add' && subtype === 'test') {
            const modal = new ModalBuilder().setCustomId('add_test_modal').setTitle('Añadir Equipos de Prueba');
            const cantidadInput = new TextInputBuilder().setCustomId('cantidad_input').setLabel("¿Cuántos equipos de prueba quieres añadir?").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(cantidadInput));
            await interaction.showModal(modal);
        } else if (type === 'simular' && subtype === 'partidos') {
            let torneoActivo = await db.get('torneo');
            if (!torneoActivo || torneoActivo.status !== 'fase_de_grupos') {
                 return interaction.editReply({ content: 'Solo se pueden simular partidos durante la fase de grupos.' });
            }
            const todosLosPartidosDeGrupos = Object.values(torneoActivo.calendario).flat(2);
            for (const partido of todosLosPartidosDeGrupos) {
                if (partido.status !== 'finalizado') {
                    partido.resultado = `${Math.floor(Math.random() * 5)}-${Math.floor(Math.random() * 5)}`;
                    partido.status = 'finalizado';
                    if (partido.channelId) await updateMatchChannelName(partido);
                }
            }
            await db.set('torneo', torneoActivo);
            await actualizarMensajeClasificacion();
            await interaction.editReply({ content: `✅ Se han simulado todos los partidos de la fase de grupos.` });
            await iniciarFaseEliminatoria(interaction.guild);
        } else if (type === 'borrar' && subtype === 'canales') {
            const allChannels = await interaction.guild.channels.fetch();
            const matchChannels = allChannels.filter(c => c.parentId === CATEGORY_ID);
            await interaction.editReply({ content: `Borrando ${matchChannels.size} canales de partido...` });
            for (const channel of matchChannels.values()) {
                await channel.delete('Limpieza de canales de torneo.').catch(err => console.error(`No se pudo borrar el canal ${channel.name}: ${err}`));
            }
            await interaction.followUp({ content: `✅ Canales borrados.`, ephemeral: true });
        } else if (type === 'finalizar') {
            const torneoActivo = await db.get('torneo');
            if (!torneoActivo) return interaction.editReply({ content: 'No hay ningún torneo activo para finalizar.' });
            await interaction.editReply({ content: 'Finalizando torneo...' });
            await limpiarCanal(INSCRIPCION_CHANNEL_ID);
            if (torneoActivo.canalEquiposId) { const c = await client.channels.fetch(torneoActivo.canalEquiposId).catch(()=>null); if(c) await c.delete(); }
            if (torneoActivo.canalGruposId) { const c = await client.channels.fetch(torneoActivo.canalGruposId).catch(()=>null); if(c) await c.delete(); }
            const allChannels = await interaction.guild.channels.fetch();
            const matchChannels = allChannels.filter(c => c.parentId === CATEGORY_ID);
            for (const channel of matchChannels.values()) { await channel.delete('Finalización de torneo.').catch(() => {}); }
            await db.set('torneo', null);
            await mostrarMensajeEspera(interaction);
            await interaction.followUp({ content: '✅ Torneo finalizado y todos los canales reseteados.', ephemeral: true });
        }
        return;
    }

    if (isModalButton) {
        if (customId === 'inscribir_equipo_btn') {
            const torneoActivo = await db.get('torneo');
            if (!torneoActivo || torneoActivo.status !== 'inscripcion_abierta') {
                return interaction.reply({ content: '🇪🇸 Las inscripciones no están abiertas en este momento.\n🇬🇧 *Registrations are not open at this time.*', ephemeral: true });
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
            const { partido } = await findMatch(customId.replace('reportar_resultado_v3_', ''));
            if(!partido) return interaction.reply({content: "Error: No se pudo encontrar el partido.", ephemeral: true });
            const modal = new ModalBuilder().setCustomId(`reportar_resultado_modal_${partido.matchId}`).setTitle('Reportar Resultado');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
            await interaction.showModal(modal);
        } else if (customId.startsWith('aportar_prueba_')) {
            const modal = new ModalBuilder().setCustomId(`modal_aportar_prueba_`).setTitle('Aportar Prueba de Vídeo');
            const videoLinkInput = new TextInputBuilder().setCustomId('video_link').setLabel("Pega el enlace del vídeo (YouTube, etc.)").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(videoLinkInput));
            await interaction.showModal(modal);
        } else if (customId.startsWith('admin_modificar_resultado_')) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: 'No tienes permisos.', ephemeral: true });
            const { partido } = await findMatch(customId.replace('admin_modificar_resultado_', ''));
            if (!partido) return interaction.reply({ content: "Error: No se pudo encontrar el partido.", ephemeral: true });
            const modal = new ModalBuilder().setCustomId(`admin_modificar_modal_${partido.matchId}`).setTitle('Modificar Resultado (Admin)');
            const golesAInput = new TextInputBuilder().setCustomId('goles_a').setLabel(`Goles de ${partido.equipoA.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[0] : '0');
            const golesBInput = new TextInputBuilder().setCustomId('goles_b').setLabel(`Goles de ${partido.equipoB.nombre}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(partido.resultado ? partido.resultado.split('-')[1] : '0');
            modal.addComponents(new ActionRowBuilder().addComponents(golesAInput), new ActionRowBuilder().addComponents(golesBInput));
            await interaction.showModal(modal);
        }
    } else if (customId.startsWith('solicitar_arbitraje_')) {
        await interaction.deferReply({ ephemeral: true });
        let torneoActivo = await db.get('torneo');
        const { partido } = findMatchInTournament(torneoActivo, customId.replace('solicitar_arbitraje_', ''));
        if(!partido) return interaction.editReply({content: "🇪🇸 Error: No se pudo encontrar el partido.\n🇬🇧 *Error: Match not found.*" });
        partido.status = 'arbitraje';
        await updateMatchChannelName(partido);
        await db.set('torneo', torneoActivo);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_modificar_resultado_${partido.matchId}`).setLabel("Modificar Resultado (Admin)").setStyle(ButtonStyle.Secondary).setEmoji("✍️"));
        await interaction.channel.send({ content: `<@&${ARBITRO_ROLE_ID}> 🇪🇸 Se ha solicitado arbitraje en este partido.\n🇬🇧 *A referee has been requested for this match.*`, components: [row] });
        await interaction.editReply({ content: "Solicitud de arbitraje enviada."})
    } else if (customId.startsWith('admin_aprobar_') || customId.startsWith('admin_rechazar_') || customId.startsWith('admin_expulsar_')) {
        await interaction.deferReply({ ephemeral: true });
        let torneoActivo = await db.get('torneo');
        const [action, type, captainId] = customId.split('_');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.editReply({ content: 'No tienes permisos.' });
        if (type === 'expulsar') {
            // ...
        } else {
            // ...
            if (type === 'aprobar') {
                // ...
            }
        }
        await db.set('torneo', torneoActivo);
    }
}

async function handleSelectMenu(interaction) {
    if (interaction.customId === 'crear_torneo_size_select') {
        await interaction.deferUpdate();
        const size = interaction.values[0];
        const typeMenu = new StringSelectMenuBuilder().setCustomId(`crear_torneo_type_select_${size}`).setPlaceholder('Paso 2: Selecciona el tipo de torneo').addOptions([{ label: 'De Pago', value: 'pago' }, { label: 'Gratuito', value: 'gratis' }]);
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
    await interaction.deferReply({ ephemeral: true });
    const { customId, fields } = interaction;
    let torneoActivo = await db.get('torneo');

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
        const equiposChannel = await interaction.guild.channels.create({ name: channelName, type: ChannelType.GuildText, topic: `Lista de equipos del torneo ${nombre}.`, permissionOverwrites: [{ id: interaction.guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] }, { id: client.user.id, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks] }] });
        let prize = 0;
        if(isPaid) {
            prize = size === 8 ? 160 : 360;
        }
        torneoActivo = { nombre, size, isPaid, prize, status: 'inscripcion_abierta', enlace_paypal: enlacePaypal, equipos_pendientes: {}, equipos_aprobados: {}, canalEquiposId: equiposChannel.id };
        const tipoTorneoTexto = isPaid ? "Cash Cup" : "Gratuito";
        const titulo = `🏆 TORNEO DISPONIBLE - ${nombre} (${tipoTorneoTexto}) 🏆`;
        let prizeText = isPaid ? `**Precio:** 25€ por equipo / *per team*\n**Premio:** ${prize}€ / **Prize:** €${prize}` : '**Precio:** Gratis / *Free*';
        const embed = new EmbedBuilder().setColor('#5865F2').setTitle(titulo).setDescription(`Para participar, haz clic abajo.\n*To participate, click below.*\n\n${prizeText}\n\n**Límite:** ${size} equipos.`);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('inscribir_equipo_btn').setLabel('Inscribir Equipo / Register Team').setStyle(ButtonStyle.Success).setEmoji('📝'));
        const newMessage = await inscripcionChannel.send({ embeds: [embed], components: [row] });
        const embedLista = new EmbedBuilder().setColor('#3498db').setTitle(`Equipos Inscritos - ${nombre}`).setDescription('Aún no hay equipos.').setFooter({ text: `Total: 0 / ${size}` });
        await equiposChannel.send({ embeds: [embedLista] });
        await db.set('torneo', torneoActivo);
        await interaction.editReply({ content: `✅ Torneo "${nombre}" (${isPaid ? 'de Pago' : 'Gratis'}) creado. Canal de equipos: ${equiposChannel}.` });
    
    } else if (customId === 'inscripcion_modal') {
        // ... (resto de la lógica)
    } // ... y así para todos los modales
    await db.set('torneo', torneoActivo);
}

// ... El resto de funciones hasta el final ...

keepAlive();
client.login(process.env.DISCORD_TOKEN);
