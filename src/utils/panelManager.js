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
        const panel = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.startsWith('Panel de Creación'));
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
    const panelContent = await createGlobalAdminPanel('main', isBotBusy);
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

        // FIX: Desarchivar el hilo si está archivado para poder enviar/editar mensajes
        if (thread.archived) {
            console.log(`[PANEL RECOVERY] ⚠️ Hilo de gestión de "${tournament.shortId}" estaba archivado. Desarchivando...`);
            await thread.setArchived(false);
        }

        const messages = await thread.messages.fetch({ limit: 20 });
        const panelMessage = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.startsWith('Gestión del Torneo:'));
        const latestTournamentState = await getDb().collection('tournaments').findOne({ _id: tournament._id });
        if (!latestTournamentState) return;
        const panelContent = createTournamentManagementPanel(latestTournamentState, busyState);
        if (panelMessage) {
            try {
                await panelMessage.edit(panelContent);
            } catch (error) {
                // Handle Discord's embed size limit (6000 characters)
                if (error.code === 50035 && error.message && error.message.includes('MAX_EMBED_SIZE')) {
                    console.error(`[EMBED SIZE] ⚠️ El panel de gestión del torneo "${latestTournamentState.nombre}" (ID: ${latestTournamentState.shortId}) excede el límite de 6000 caracteres de Discord. El panel no puede actualizarse hasta que el torneo tenga menos equipos o se simplifique el embed.`);
                } else {
                    throw error;
                }
            }
        } else {
            // Auto-regenerar: si el panel fue destruido o corrompido, enviar uno nuevo
            console.log(`[PANEL RECOVERY] ⚠️ Panel de gestión no encontrado para "${latestTournamentState.nombre}" (${latestTournamentState.shortId}). Regenerando...`);
            await thread.send(panelContent);
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

        // FIX: Desarchivar el hilo si está archivado
        if (thread.archived) {
            console.log(`[PANEL RECOVERY] ⚠️ Hilo de gestión del draft "${draft.shortId}" estaba archivado. Desarchivando...`);
            await thread.setArchived(false);
        }

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
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.warn(`[WARN] No se pudo encontrar el canal con ID ${channelId} para renombrarlo.`);
            return;
        }

        let baseName;

        // Identificamos el nombre base CORRECTO según el ID del canal
        if (channelId === CHANNELS.TOURNAMENTS_STATUS) {
            baseName = '📢-inscripciones';
        } else {
            console.warn(`[WARN] Se intentó cambiar el icono de un canal no reconocido con ID: ${channelId}`);
            return;
        }

        // Reconstruimos el nombre completo desde cero: [NUEVO ICONO] + [NOMBRE BASE]
        const newChannelName = `${icon} ${baseName}`;

        if (channel.name !== newChannelName) {
            await channel.setName(newChannelName.slice(0, 100));
        }
    } catch (e) {
        console.warn(`[WARN] Error crítico al intentar actualizar el nombre del canal ${channelId}.`, e);
    }
}
