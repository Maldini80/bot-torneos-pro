// src/handlers/commandHandler.js
import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { getDb } from '../../database.js';
import { createGlobalAdminPanel } from '../utils/embeds.js';
import { languageRoles } from '../../config.js';
import { updateAdminPanel } from '../utils/panelManager.js';

export async function handleCommand(interaction) {
    const { commandName } = interaction;

    if (commandName === 'panel-admin') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permisos para usar este comando.', ephemeral: true });
        }
        await interaction.reply({ content: "Creando o actualizando el panel de control...", ephemeral: true });
        
        const oldPanels = await interaction.channel.messages.fetch({ limit: 50 });
        const messagesToDelete = oldPanels.filter(m => m.author.id === interaction.client.user.id && m.embeds[0]?.title === 'Panel de Control Global de Torneos');
        if (messagesToDelete.size > 0) {
            await interaction.channel.bulkDelete(messagesToDelete);
        }
        
        const panelContent = createGlobalAdminPanel();
        await interaction.channel.send(panelContent);
        await updateAdminPanel(interaction.client);
    }
    
    if (commandName === 'setup-idiomas') {
         if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permisos para usar este comando.', ephemeral: true });
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
        await interaction.reply({ content: 'Panel de idiomas creado.', ephemeral: true });
    }
}
