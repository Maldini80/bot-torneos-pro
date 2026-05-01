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
            .setColor(crawlerOn ? '#2ecc71' : '#c0392b')
            .setFooter({ text: 'Selecciona una categoría para ver las herramientas (Solo tú las verás).' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vpg_admin_category_equipos').setLabel('Equipos').setStyle(ButtonStyle.Primary).setEmoji('🏟️'),
            new ButtonBuilder().setCustomId('vpg_admin_category_ligas').setLabel('Ligas').setStyle(ButtonStyle.Success).setEmoji('🏆'),
            new ButtonBuilder().setCustomId('vpg_admin_category_ea_stats').setLabel('EA Stats').setStyle(ButtonStyle.Secondary).setEmoji('📊')
        );
        
        const panelMsg = await interaction.channel.send({ embeds: [embed], components: [row] });

        // Guardar referencia del mensaje del panel para poder actualizarlo desde sub-paneles
        await getDb().collection('bot_settings').updateOne(
            { _id: 'global_config' },
            { $set: { vpgAdminPanel: { messageId: panelMsg.id, channelId: interaction.channelId } } }
        );
        
        return interaction.editReply({ content: '✅ Panel de administrador creado con éxito.' });
    }
};
