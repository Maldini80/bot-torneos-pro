// src/utils/panelManager.js
import { getDb } from '../../database.js';
import { CHANNELS } from '../../config.js';
import { createGlobalAdminPanel } from './embeds.js';
import { isBotBusy } from '../../index.js';

// Esta función ahora siempre buscará el mensaje en Discord, es más robusta.
async function fetchPanelMessage(client) {
    try {
        const channel = await client.channels.fetch(CHANNELS.GLOBAL_ADMIN_PANEL);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 50 });
        const panel = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === 'Panel de Control Global de Torneos');
        return panel;
    } catch (e) {
        console.error("Error al buscar el panel de admin:", e.message);
        return null;
    }
}

// La función principal para actualizar el panel.
export async function updateAdminPanel(client) {
    const msg = await fetchPanelMessage(client);
    
    if (!msg) {
        console.warn("Se intentó actualizar el panel de admin, pero no se encontró el mensaje. Usa /panel-admin para crearlo.");
        return;
    }
    
    const db = getDb();
    const activeTournaments = await db.collection('tournaments').find({ status: { $nin: ['finalizado', 'archivado'] } }).toArray();
    const panelContent = createGlobalAdminPanel(activeTournaments, isBotBusy);
    
    try {
        await msg.edit(panelContent);
    } catch (error) {
        // Ignorar si el mensaje ya fue borrado, lo cual es normal.
        if (error.code !== 10008) {
            console.warn(`[WARN] No se pudo editar el panel de admin. ${error.message}`);
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
