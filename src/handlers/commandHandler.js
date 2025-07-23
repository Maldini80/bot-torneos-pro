// src/handlers/commandHandler.js
import { EmbedBuilder, PermissionsBitField, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { getDb } from '../../database.js';
import { createGlobalAdminPanel } from '../utils/embeds.js';
import { languageRoles, CHANNELS } from '../../config.js';
import { updateAdminPanel } from '../utils/panelManager.js';

export async function handleCommand(interaction) {
    const { commandName } = interaction;

    if (commandName === 'panel-admin') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permisos para usar este comando.', flags: [MessageFlags.Ephemeral] });
        }
        
        if (interaction.channel.id !== CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT) {
            return interaction.reply({ content: `Este comando solo puede usarse en el canal <#${CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT}>.`, flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const oldPanels = await interaction.channel.messages.fetch({ limit: 50 });
        const messagesToDelete = oldPanels.filter(m => m.author.id === interaction.client.user.id && m.embeds[0]?.title === 'Panel de Creación de Torneos');
        if (messagesToDelete.size > 0) {
            try {
                await interaction.channel.bulkDelete(messagesToDelete);
            } catch (e) {
                console.warn("No se pudieron borrar los paneles antiguos, puede que sean demasiado viejos.");
            }
        }
        
        const panelContent = createGlobalAdminPanel();
        await interaction.channel.send(panelContent);
        await interaction.editReply({ content: "✅ Panel de creación global generado con éxito." });
    }
    
    if (commandName === 'setup-idiomas') {
         if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permisos para usar este comando.', flags: [MessageFlags.Ephemeral] });
        }
        
        const embed = new EmbedBuilder()
            .setColor('#8b5cf6')
            .setTitle('🌍 Selección de Idioma / Language Selection')
            .setDescription('Reacciona a tu bandera para traducir tus mensajes.\n*React with your flag to have your messages translated.*')
            .setFooter({ text: 'Solo puedes tener un rol de idioma. Cambiar de rol eliminará el anterior.' });

        Object.entries(languageRoles).forEach(([flag, { name }]) => {
            embed.addFields({ name: `${flag} ${name}`, value: ` `, inline: true });
        });
        
        const sentMessage = await interaction.channel.send({ embeds: [embed] });
        for (const flag in languageRoles) {
            await sentMessage.react(flag);
        }
        await interaction.reply({ content: 'Panel de idiomas creado.', flags: [MessageFlags.Ephemeral] });
    }

    // --- INICIO DEL NUEVO CÓDIGO DE PRUEBA ---
    if (commandName === 'crear-boton-test') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permisos para esto.', flags: [MessageFlags.Ephemeral] });
        }

        // Creamos nuestro NUEVO botón de prueba
        const testButton = new ButtonBuilder()
            .setCustomId('test_upload_heights_start') // <-- ¡NOMBRE INTERNO NUEVO Y ÚNICO!
            .setLabel('Subir Vídeo de Prueba')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🧪');

        const row = new ActionRowBuilder().addComponents(testButton);

        await interaction.channel.send({
            content: "Aquí tienes el botón para probar el nuevo flujo de subida de vídeos:",
            components: [row]
        });

        await interaction.reply({ content: 'Botón de prueba creado.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    // --- FIN DEL NUEVO CÓDIGO DE PRUEBA ---
}
