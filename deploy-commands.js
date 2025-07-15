// deploy-commands.js - VERSIÓN FINAL Y CONSISTENTE
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;

if (!clientId || !guildId || !token) {
    console.error('Error: Por favor, define CLIENT_ID, GUILD_ID, y DISCORD_TOKEN en tu archivo .env.');
    process.exit(1);
}

// Lista de comandos final y limpia
const commands = [
    new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control de administrador para el torneo.'),
    
    new SlashCommandBuilder()
        .setName('sortear-grupos')
        .setDescription('Realiza el sorteo de grupos y crea los hilos de partido.'),

    new SlashCommandBuilder()
        .setName('iniciar-eliminatorias')
        .setDescription('Inicia la fase de eliminatorias si todos los partidos de grupo han terminado.')
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`Empezando a registrar ${commands.length} comandos de aplicación (/).`);

        // El método .put sobreescribe todos los comandos existentes con la nueva lista
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log('Comandos de aplicación (/) registrados exitosamente.');
    } catch (error) {
        console.error('Ocurrió un error al registrar los comandos:', error);
    }
})();
