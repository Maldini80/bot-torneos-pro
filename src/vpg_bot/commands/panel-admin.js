// src/commands/panel-admin.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control para administradores.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const { getBotSettings } = await import('../../../database.js');
        const { getDb } = await import('../../../database.js');
        const settings = await getBotSettings();
        const crawlerOn = settings.crawlerEnabled;

        // Obtener config adicional
        const config = await getDb().collection('bot_settings').findOne({ _id: 'global_config' });
        const crawlerDays = settings.crawlerDays || [];
        const crawlerStart = settings.crawlerStartTime || '22:20';
        const crawlerEnd = settings.crawlerEndTime || '01:00';
        const timeSlots = config?.timeSlots || [];
        
        const dayNames = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 0: 'Dom' };
        const daysStr = crawlerDays.length > 0 ? crawlerDays.map(d => dayNames[d]).join(', ') : 'Sin configurar';
        const slotsStr = timeSlots.length > 0 ? timeSlots.map(s => s.name).join(', ') : 'Ninguna';

        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Administrador VPG')
            .setDescription(
                `🤖 **Crawler:** ${crawlerOn ? '**ACTIVO** 🟢' : '**PAUSADO** 🔴'}\n` +
                `📅 **Días de escaneo:** ${daysStr}\n` +
                `⏰ **Franja del crawler:** ${crawlerStart} — ${crawlerEnd} (Madrid)\n` +
                `📐 **Franjas stats guardadas:** ${slotsStr}`
            )
            .setColor(crawlerOn ? '#2ecc71' : '#c0392b');
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_create_team_button').setLabel('Crear Equipo').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId('admin_manage_team_button').setLabel('Gestionar Equipos').setStyle(ButtonStyle.Primary).setEmoji('📋'),
            new ButtonBuilder().setCustomId('admin_search_team_button').setLabel('Buscar Equipo').setStyle(ButtonStyle.Primary).setEmoji('🔍'),
            new ButtonBuilder().setCustomId('admin_view_pending_requests').setLabel('Ver Solicitudes').setStyle(ButtonStyle.Secondary).setEmoji('⏳')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_create_league_button').setLabel('Crear Liga').setStyle(ButtonStyle.Success).setEmoji('🏆'),
            new ButtonBuilder().setCustomId('admin_delete_league_button').setLabel('Borrar Liga').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_toggle_crawler').setLabel(crawlerOn ? 'Crawler: ACTIVO 🟢' : 'Crawler: PAUSADO 🔴').setStyle(crawlerOn ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_config_crawler_days').setLabel('Días de Escaneo').setStyle(ButtonStyle.Secondary).setEmoji('📅'),
            new ButtonBuilder().setCustomId('admin_config_crawler_time').setLabel('Franja Horaria').setStyle(ButtonStyle.Secondary).setEmoji('⏰'),
            new ButtonBuilder().setCustomId('admin_force_crawler').setLabel('Forzar Escaneo Ahora').setStyle(ButtonStyle.Success).setEmoji('🚀'),
            new ButtonBuilder().setCustomId('admin_rescan_profiles').setLabel('Recalcular Stats').setStyle(ButtonStyle.Danger).setEmoji('🔄')
        );
        const row4 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('stats_debug_ea').setLabel('Debug EA').setStyle(ButtonStyle.Secondary).setEmoji('🔬'),
            new ButtonBuilder().setCustomId('admin_manage_time_slots').setLabel('Gestionar Franjas').setStyle(ButtonStyle.Secondary).setEmoji('📐')
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row, row2, row3, row4] });
        
        return interaction.editReply({ content: '✅ Panel de administrador creado con éxito.' });
    }
};
