// src/handlers/commandHandler.js
import { EmbedBuilder, PermissionsBitField, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
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
    
    if (commandName === 'probar-subida-real') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Este comando es solo para administradores.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const uploadButton = new ButtonBuilder()
                .setLabel('Prueba de altura perks')
                .setURL('https://streamable.com')
                .setStyle(ButtonStyle.Link)
                .setEmoji('📹');
            
            const row = new ActionRowBuilder().addComponents(uploadButton);

            const thread = await interaction.channel.threads.create({
                name: '🧪-test-subida',
                autoArchiveDuration: 60,
                reason: 'Hilo de prueba para la subida de vídeos.'
            });

            const footerText = '🇪🇸 Para subir una prueba, usa el botón o pega un enlace de YouTube/Twitch.\n' +
                               '🇬🇧 To upload proof, use the button or paste a YouTube/Twitch link.';
            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('Laboratorio de Pruebas')
                .setDescription("Aquí puedes probar el sistema de subida de vídeos:\n\n1.  **Prueba el Botón:** Haz clic en el botón de abajo.\n2.  **Prueba el Pegado:** Pega un enlace de `Streamable`, `YouTube` o `Twitch` directamente en este chat.")
                .setFooter({ text: footerText });

            await thread.send({
                embeds: [embed],
                components: [row]
            });
            
            await interaction.editReply(`✅ Hilo de prueba creado: ${thread.toString()}. Ve allí para comenzar el test.`);

        } catch (error) {
            console.error("Error al crear el hilo de prueba:", error);
            await interaction.editReply({ content: '❌ No se pudo crear el hilo de prueba.' });
        }
    }
}
