// deploy-commands.js
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;

if (!clientId || !guildId || !token) {
    console.error('Error: Asegúrate de que CLIENT_ID, GUILD_ID, y DISCORD_TOKEN están en las variables de entorno de Render.');
    process.exit(1);
}
const commands = [
    new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control global para gestionar todos los torneos.'),
    new SlashCommandBuilder()
        .setName('setup-idiomas')
        .setDescription('Crea el panel de selección de idiomas para la traducción automática.')
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
