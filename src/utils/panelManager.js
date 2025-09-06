// src/utils/panelManager.js
import { getDb } from '../../database.js';
import { CHANNELS, TOURNAMENT_STATUS_ICONS } from '../../config.js';
// Se importa el nuevo embed para la gestión del draft
import { createGlobalAdminPanel, createTournamentManagementPanel, createDraftManagementPanel } from './embeds.js';
import { isBotBusy } from '../../index.js';

async function fetchGlobalCreationPanel(client) {
    try {
        const channel = await client.channels.fetch(CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 50 });
        const panel = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title.startsWith('Panel de Creación'));
        return panel;
    } catch (e) {
        console.error("Error al buscar el panel de creación global:", e.message);
        return null;
    }
}

export async function updateAdminPanel(client) {
    const msg = await fetchGlobalCreationPanel(client);
    if (!msg) return;
    // La creación del panel ahora es asíncrona
    const panelContent = await createGlobalAdminPanel(isBotBusy);
    try {
        await msg.edit(panelContent);
    } catch (error) {
        if (error.code !== 10008) {
            console.warn(`[WARN] No se pudo editar el panel de creación global. ${error.message}`);
        }
    }
}

export async function updateTournamentManagementThread(client, tournament, busyState = isBotBusy) {
    if (!tournament || !tournament.discordMessageIds.managementThreadId) return;
    try {
        const thread = await client.channels.fetch(tournament.discordMessageIds.managementThreadId);
        const messages = await thread.messages.fetch({ limit: 20 });
        const panelMessage = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title.startsWith('Gestión del Torneo:'));
        const latestTournamentState = await getDb().collection('tournaments').findOne({ _id: tournament._id });
        if (!latestTournamentState) return;
        if (panelMessage) {
            const panelContent = createTournamentManagementPanel(latestTournamentState, busyState);
            await panelMessage.edit(panelContent);
        }
    } catch (e) {
        if (e.code !== 10003 && e.code !== 10008) {
            console.error(`Error al actualizar el hilo de gestión para ${tournament.shortId}:`, e);
        }
    }
}

export async function updateAllManagementPanels(client, busyState) {
    const db = getDb();
    const activeTournaments = await db.collection('tournaments').find({ status: { $nin: ['finalizado', 'archivado'] } }).toArray();
    for (const tournament of activeTournaments) {
        await updateTournamentManagementThread(client, tournament, busyState);
    }
}


// --- INICIO DE LA MODIFICACIÓN ---

/**
 * NUEVO: Actualiza el panel de gestión de un draft específico.
 */
export async function updateDraftManagementPanel(client, draft, busyState = isBotBusy) {
    if (!draft || !draft.discordMessageIds.managementThreadId) return;
    try {
        const thread = await client.channels.fetch(draft.discordMessageIds.managementThreadId);
        const messages = await thread.messages.fetch({ limit: 20 });
        const panelMessage = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title.startsWith('Gestión del Draft:'));
        const latestDraftState = await getDb().collection('drafts').findOne({ _id: draft._id });
        if (!latestDraftState) return;
        if (panelMessage) {
            const panelContent = createDraftManagementPanel(latestDraftState, busyState);
            await panelMessage.edit(panelContent);
        }
    } catch (e) {
        if (e.code !== 10003 && e.code !== 10008) {
            console.error(`Error al actualizar el hilo de gestión para el draft ${draft.shortId}:`, e);
        }
    }
}

/**
 * NUEVO: Actualiza TODOS los paneles de gestión de drafts activos.
 */
export async function updateAllDraftManagementPanels(client, busyState) {
    const db = getDb();
    const activeDrafts = await db.collection('drafts').find({ status: { $nin: ['torneo_generado', 'cancelado'] } }).toArray();
    for (const draft of activeDrafts) {
        await updateDraftManagementPanel(client, draft, busyState);
    }
}

// --- FIN DE LA MODIFICACIÓN ---


export async function setChannelIcon(client, channelId, icon) {
    try {
        // Ahora usa el ID que le pasamos
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.warn(`[WARN] No se pudo encontrar el canal con ID ${channelId} para renombrarlo.`);
            return;
        }

        // Extraemos el nombre base sin el icono
        const baseName = channel.name.replace(/^[^\s]+\s/g, '');
        const newChannelName = `${icon} ${baseName}`;

        if (channel.name !== newChannelName) {
            await channel.setName(newChannelName.slice(0, 100));
        }
    } catch (e) {
        console.warn(`[WARN] Error crítico al intentar actualizar el nombre del canal ${channelId}.`, e);
    }
}
