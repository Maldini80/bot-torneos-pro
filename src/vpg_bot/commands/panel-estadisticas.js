// src/commands/panel-estadisticas.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-estadisticas')
        .setDescription('Crea el Kiosko de Estadísticas Avanzadas de EA Sports.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const embed = new EmbedBuilder()
            .setTitle('📊 Centro de Estadísticas EA Sports')
            .setDescription('Analiza el rendimiento real de los jugadores y equipos escaneados por nuestro motor VPG.\n\nPulsa los botones de abajo para solicitar un informe detallado.')
            .setColor('#1abc9c')
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/3103/3103407.png'); // Icono de radar/stats
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('stats_team_scout')
                .setLabel('Análisis de Equipo')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🛡️'),
            new ButtonBuilder()
                .setCustomId('stats_player_scout')
                .setLabel('Scout de Jugador')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔍')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        
        return interaction.editReply({ content: '✅ Panel de estadísticas avanzado generado con éxito.' });
    }
};
