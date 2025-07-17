// src/utils/panelManager.js
import { getDb } from '../../database.js';
import { CHANNELS } from '../../config.js';
import { createGlobalAdminPanel } from './embeds.js';
import { isBotBusy } from '../../index.js';

let panelMessage = null;

async function fetchPanelMessage(client) {
    if (panelMessage) return panelMessage;
    try {
        const channel = await client.channels.fetch(CHANNELS.GLOBAL_ADMIN_PANEL);
        const messages = await channel.messages.fetch({ limit: 50 });
        panelMessage = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === 'Panel de Control Global de Torneos');
        return panelMessage;
    } catch (e) {
        console.error("No se pudo encontrar el mensaje del panel de admin.", e.message);
        return null;
    }
}

export async function updateAdminPanel(client) {
    const msg = await fetchPanelMessage(client);
    if (!msg) {
        console.warn("Se intentó actualizar el panel de admin, pero no se encontró el mensaje. Usa /panel-admin para crearlo.");
        return;
    }
    const db = getDb();
    const activeTournaments = await db.collection('tournaments').find({ status: { $nin: ['finalizado', 'archivado'] } }).toArray();
    const panelContent = createGlobalAdminPanel(activeTournaments, isBotBusy);
    await msg.edit(panelContent);
}

export async function updateTournamentChannelName(client) {
    try {
        const db = getDb();
        const activeTournaments = await db.collection('tournaments').find({ status: { $nin: ['finalizado', 'archivado', 'cancelado'] } }).toArray();
        let newName;
        const openForRegistration = activeTournaments.filter(t => t.status === 'inscripcion_abierta').length;
        const inProgress = activeTournaments.filter(t => ['fase_de_grupos', 'eliminatorias', 'octavos', 'cuartos', 'semifinales', 'final'].includes(t.status)).length;
        const statusParts = [];
        if (openForRegistration > 0) statusParts.push(`🟢${openForRegistration}`);
        if (inProgress > 0) statusParts.push(`🔵${inProgress}`);
        
        if (statusParts.length > 0) {
            newName = `[${statusParts.join('|')}] 📢 Torneos-Tournaments`;
        } else {
            newName = '[⚫️] 📢 Torneos-Tournaments';
        }
        
        const channel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        if (channel && channel.name !== newName) {
            await channel.setName(newName.slice(0, 100));
        }
    } catch (e) {
        console.warn("[WARN] No se pudo actualizar el nombre del canal de estado de torneos.", e.message);
    }
}
