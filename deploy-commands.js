// deploy-commands.js
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';

// --- SECCIÓN MODIFICADA ---
// Ahora busca 'DISCORD_CLIENT_ID' en lugar de 'CLIENT_ID'.
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;

// Se actualiza el mensaje de error para reflejar el nombre correcto de la variable.
if (!clientId || !guildId || !token) {
    console.error('Error: Asegúrate de que DISCORD_CLIENT_ID, GUILD_ID, y DISCORD_TOKEN están en las variables de entorno de Render.');
    process.exit(1);
}
// --- FIN DE LA SECCIÓN MODIFICADA ---

const commands = [
    new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control global para gestionar todos los torneos.'),
    new SlashCommandBuilder()
        .setName('setup-idiomas')
        .setDescription('Crea el panel de selección de idiomas para la traducción automática.'),
    new SlashCommandBuilder()
        .setName('probar-subida-real')
        .setDescription('Crea un hilo de prueba para el sistema de subida de vídeos.'),
     new SlashCommandBuilder()
        .setName('probar-imagen-twitter')
        .setDescription('Genera una imagen de prueba con el estilo de Twitter.')
        .addStringOption(option =>
            option.setName('titulo')
                .setDescription('El texto principal que aparecerá en la imagen.')
                .setRequired(true)),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`Registrando ${commands.length} comandos de aplicación (/).`);
        
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log('Comandos de aplicación (/) registrados exitosamente.');
    } catch (error) {
        console.error('Ocurrió un error al registrar los comandos:', error);
    }
})();
