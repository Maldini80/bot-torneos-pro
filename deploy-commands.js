// deploy-commands.js
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;

if (!clientId || !guildId || !token) {
    console.error('Error: Por favor, define CLIENT_ID, GUILD_ID, y DISCORD_TOKEN en tu archivo .env o en los Secrets de Replit.');
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control de administrador para el torneo.'),
    new SlashCommandBuilder()
        .setName('sortear-grupos')
        .setDescription('Realiza el sorteo de grupos y crea los canales de partido.'),
    new SlashCommandBuilder()
        .setName('modificar-resultado')
        .setDescription('Modifica o establece manualmente el resultado de un partido.')
        .addStringOption(option => 
            option.setName('equipo_a')
                .setDescription('Nombre exacto del primer equipo.')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('goles_a')
                .setDescription('Goles del primer equipo.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('equipo_b')
                .setDescription('Nombre exacto del segundo equipo.')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('goles_b')
                .setDescription('Goles del segundo equipo.')
                .setRequired(true))
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Empezando a registrar los comandos de aplicación (/).');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log('Comandos de aplicación (/) registrados exitosamente.');
    } catch (error) {
        console.error('Ocurrió un error al registrar los comandos:', error);
    }
})();