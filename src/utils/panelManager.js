// src/utils/panelManager.js
import { getDb } from '../../database.js';
import { CHANNELS, TOURNAMENT_STATUS_ICONS } from '../../config.js';
// --- INICIO DE LA MODIFICACIÓN ---
// Se importa el nuevo embed para el panel de MD del capitán.
import { createGlobalAdminPanel, createTournamentManagementPanel, createDraftManagementPanel, createCaptainDmPanel } from './embeds.js';
// --- FIN DE LA MODIFICACIÓN ---
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

export async function updateAllDraftManagementPanels(client, busyState) {
    const db = getDb();
    const activeDrafts = await db.collection('drafts').find({ status: { $nin: ['torneo_generado', 'cancelado'] } }).toArray();
    for (const draft of activeDrafts) {
        await updateDraftManagementPanel(client, draft, busyState);
    }
}

// --- INICIO DE LA MODIFICACIÓN (Nuevas funciones para paneles de MD) ---

/**
 * Actualiza el panel de MD de un capitán específico.
 * @param {import('discord.js').Client} client - El cliente de Discord.
 * @param {object} captain - El objeto del capitán.
 * @param {object} draft - El estado actual del draft.
 */
export async function updateCaptainDmPanel(client, captain, draft) {
    if (!captain.dmPanelMessageId || !/^\d+$/.test(captain.userId)) return;

    try {
        const user = await client.users.fetch(captain.userId);
        const dmChannel = await user.createDM();
        const message = await dmChannel.messages.fetch(captain.dmPanelMessageId);
        const panelContent = createCaptainDmPanel(captain, draft);
        await message.edit(panelContent);
    } catch (error) {
        if (error.code === 50007) { // Cannot send messages to this user
            console.warn(`No se pudo actualizar el panel de MD para ${captain.userName} porque tiene los MDs bloqueados.`);
        } else if (error.code !== 10008) { // Unknown Message
            console.warn(`No se pudo actualizar el panel de MD para ${captain.userName}. El mensaje podría haber sido borrado. Error: ${error.message}`);
        }
    }
}


/**
 * Actualiza todos los paneles de MD de los capitanes de un draft.
 * @param {import('discord.js').Client} client - El cliente de Discord.
 * @param {object} draft - El estado actual del draft.
 */
export async function updateAllCaptainDmPanels(client, draft) {
    if (draft.status !== 'seleccion') return;

    for (const captain of draft.captains) {
        await updateCaptainDmPanel(client, captain, draft);
    }
}

// --- FIN DE LA MODIFICACIÓN ---


export async function setChannelIcon(client, icon) {
    try {
        const channel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        if (!channel) {
            console.warn("[WARN] No se pudo encontrar el canal de estado de torneos para renombrarlo.");
            return;
        }

        const newChannelName = `${icon} 📢-torneos-tournaments`;
        if (channel.name !== newChannelName) {
            await channel.setName(newChannelName.slice(0, 100));
        }
    } catch (e) {
        console.warn("[WARN] Error crítico al intentar actualizar el nombre del canal de estado.", e);
    }
}
