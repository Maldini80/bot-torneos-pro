// src/commands/panel-admin.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control para administradores.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // CORRECCIÓN: Usamos flags: 64 en lugar de ephemeral: true
        await interaction.deferReply({ flags: 64 });

        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Administrador VPG')
            .setDescription('Usa los botones de abajo para gestionar la comunidad.')
            .setColor('#c0392b');
            
        const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_create_team_button').setLabel('➕ Crear Equipo').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin_create_league_button').setLabel('Crear Liga').setStyle(ButtonStyle.Success).setEmoji('🏆'),
    new ButtonBuilder().setCustomId('admin_delete_league_button').setLabel('Borrar Liga').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId('admin_manage_team_button').setLabel('Gestionar Equipo').setStyle(ButtonStyle.Primary).setEmoji('🔍'),
    new ButtonBuilder().setCustomId('admin_view_pending_requests').setLabel('Ver Solicitudes').setStyle(ButtonStyle.Secondary).setEmoji('⏳')
);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_toggle_crawler').setLabel('Crawler EA: ON/OFF').setStyle(ButtonStyle.Secondary).setEmoji('🤖'),
            new ButtonBuilder().setCustomId('admin_config_crawler_days').setLabel('Días de Escaneo').setStyle(ButtonStyle.Secondary).setEmoji('📅')
        );
        
        // Enviamos el panel al canal
        await interaction.channel.send({ embeds: [embed], components: [row, row2] });
        
        // Editamos la respuesta privada para confirmar
        return interaction.editReply({ content: '✅ Panel de administrador creado con éxito.' });
    },
};
