// src/logic/tournamentLogic.js
import { getDb } from '../../database.js';
import { TOURNAMENT_FORMATS, CHANNELS, TOURNAMENT_CATEGORY_ID } from '../../config.js';
import { createMatchObject, createMatchThread } from '../utils/tournamentUtils.js';
import { createTeamListEmbed, createClassificationEmbed, createCalendarEmbed, createTournamentStatusEmbed } from '../utils/embeds.js';
import { updateTournamentChannelName, updateAdminPanel } from '../utils/panelManager.js';
import { ObjectId } from 'mongodb';
import { EmbedBuilder, ChannelType } from 'discord.js';

// ... (El resto de funciones como createNewTournament, startGroupStage, etc. son correctas) ...
export async function createNewTournament(client, guild, name, shortId, config) { /* ... tu código ... */ }
export async function startGroupStage(client, guild, tournament) { /* ... tu código ... */ }
export async function approveTeam(client, tournament, teamData) { /* ... tu-código ... */ }
export async function updatePublicMessages(client, tournament) { /* ... tu código ... */ }

// --- ¡¡¡VERSIÓN CON EXPERIENCIA DE USUARIO MEJORADA!!! ---
export async function endTournament(client, tournament) {
    console.log(`[LOGIC] Iniciando finalización para: ${tournament.shortId}`);
    const db = getDb();

    // CAMBIO 1: Actualizar el estado en la BD INMEDIATAMENTE.
    console.log(`[LOGIC] Marcando torneo como 'finalizado' en la BD...`);
    await db.collection('tournaments').updateOne({ _id: tournament._id }, { $set: { status: 'finalizado' } });

    // CAMBIO 2: Actualizar la interfaz AHORA.
    // Esto dará una respuesta visual instantánea al admin.
    console.log(`[LOGIC] Actualizando interfaz (panel y canal) para reflejar el estado finalizado...`);
    await updateTournamentChannelName(client);
    await updateAdminPanel(client);

    // CAMBIO 3: Hacer la limpieza pesada al final.
    // Esto se ejecuta en segundo plano sin que el admin tenga que esperar.
    console.log(`[LOGIC] Iniciando limpieza de recursos en segundo plano...`);
    await cleanupTournament(client, tournament);

    console.log(`[LOGIC] Proceso de finalización completado para: ${tournament.shortId}`);
}

async function cleanupTournament(client, tournament) {
    console.log(`[CLEANUP] Iniciando limpieza de recursos para: ${tournament.shortId}`);
    const { discordMessageIds } = tournament;

    // Esta función auxiliar con depuración es perfecta, la mantenemos.
    const deleteMessageSafe = async (channelId, messageId, resourceName) => {
        if (!channelId || !messageId) {
            console.log(`[CLEANUP] Saltando ${resourceName} (ID nulo).`);
            return;
        }
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            await message.delete();
            console.log(`[CLEANUP] ÉXITO al borrar ${resourceName}.`);
        } catch (err) {
            if (err.code !== 10008) { // Ignorar error de "Mensaje Desconocido"
                console.error(`[CLEANUP] FALLO al borrar ${resourceName}. Error: ${err.message}`);
            }
        }
    };

    const deleteChannelSafe = async (channelId, resourceName) => {
        if (!channelId) {
            console.log(`[CLEANUP] Saltando ${resourceName} (ID nulo).`);
            return;
        }
        try {
            const channel = await client.channels.fetch(channelId);
            await channel.delete('Torneo finalizado.');
            console.log(`[CLEANUP] ÉXITO al borrar ${resourceName}.`);
        } catch (err) {
            if (err.code !== 10003) { // Ignorar error de "Canal Desconocido"
                console.error(`[CLEANUP] FALLO al borrar ${resourceName}. Error: ${err.message}`);
            }
        }
    };

    // La limpieza se ejecuta de forma segura.
    await deleteMessageSafe(CHANNELS.TORNEOS_STATUS, discordMessageIds.statusMessageId, 'Mensaje de Estado');
    await deleteMessageSafe(CHANNELS.INSCRIPCIONES, discordMessageIds.inscriptionMessageId, 'Mensaje de Inscripciones');
    await deleteMessageSafe(CHANNELS.CAPITANES_INSCRITOS, discordMessageIds.teamListMessageId, 'Mensaje de Lista de Equipos');
    await deleteMessageSafe(CHANNELS.CLASIFICACION, discordMessageIds.classificationMessageId, 'Mensaje de Clasificación');
    await deleteMessageSafe(CHANNELS.CALENDARIO, discordMessageIds.calendarMessageId, 'Mensaje de Calendario');
    await deleteChannelSafe(discordMessageIds.matchThreadsParentId, 'Canal de Partidos');

    console.log(`[CLEANUP] Limpieza de recursos completada.`);
}
