// src/utils/panelManager.js
import { getDb } from '../../database.js';
import { CHANNELS } from '../../config.js';
import { createGlobalAdminPanel, createTournamentManagementPanel } from './embeds.js';
import { isBotBusy } from '../../index.js';

// MODIFICADO: Esta función ahora busca el panel de CREACIÓN global.
async function fetchGlobalCreationPanel(client) {
    try {
        const channel = await client.channels.fetch(CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 50 });
        const panel = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === 'Panel de Creación de Torneos');
        return panel;
    } catch (e) {
        console.error("Error al buscar el panel de creación global:", e.message);
        return null;
    }
}

// MODIFICADO: Actualiza el panel de CREACIÓN global.
export async function updateAdminPanel(client) {
    const msg = await fetchGlobalCreationPanel(client);
    
    if (!msg) {
        // No mostramos advertencia, ya que la gestión principal ahora está en los hilos.
        // El comando /panel-admin se usará para crear este panel si no existe.
        return;
    }
    
    const panelContent = createGlobalAdminPanel(isBotBusy);
    
    try {
        await msg.edit(panelContent);
    } catch (error) {
        // Ignorar error si el mensaje fue borrado.
        if (error.code !== 10008) {
            console.warn(`[WARN] No se pudo editar el panel de creación global. ${error.message}`);
        }
    }
}

// NUEVO: Función para actualizar el panel de gestión específico de un torneo en su hilo.
export async function updateTournamentManagementThread(client, tournament) {
    if (!tournament || !tournament.discordMessageIds.managementThreadId) return;

    try {
        const thread = await client.channels.fetch(tournament.discordMessageIds.managementThreadId);
        const messages = await thread.messages.fetch({ limit: 20 });
        // Busca el mensaje del panel en el hilo
        const panelMessage = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title.startsWith('Gestión del Torneo:'));

        const latestTournamentState = await getDb().collection('tournaments').findOne({ _id: tournament._id });
        if (!latestTournamentState) return;

        if (panelMessage) {
            const panelContent = createTournamentManagementPanel(latestTournamentState);
            await panelMessage.edit(panelContent);
        }
    } catch (e) {
        if (e.code !== 10003 && e.code !== 10008) { // 10003 = Unknown Channel, 10008 = Unknown Message
            console.error(`Error al actualizar el hilo de gestión para ${tournament.shortId}:`, e);
        }
    }
}


export async function updateTournamentChannelName(client) {
    try {
        const db = getDb();
        const activeTournaments = await db.collection('tournaments').find({ status: { $nin: ['finalizado', 'archivado', 'cancelado'] } }).toArray();
        let newName;
        const openForRegistration = activeTournaments.filter(t => t.status === 'inscripcion_abierta').length;
        const inProgress = activeTournaments.filter(t => !['inscripcion_abierta', 'finalizado', 'archivado', 'cancelado'].includes(t.status)).length;
        
        const statusParts = [];
        if (openForRegistration > 0) statusParts.push(`🟢${openForRegistration}`);
        if (inProgress > 0) statusParts.push(`🔵${inProgress}`);
        
        newName = statusParts.length > 0 ? `[${statusParts.join('|')}] 📢 Torneos-Tournaments` : '[⚫️] 📢 Torneos-Tournaments';
        
        const channel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        if (channel && channel.name !== newName) {
            await channel.setName(newName.slice(0, 100));
        }
    } catch (e) {
        console.warn("[WARN] No se pudo actualizar el nombre del canal de estado de torneos.", e.message);
    }
}
