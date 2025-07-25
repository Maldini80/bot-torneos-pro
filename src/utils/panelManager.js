// src/utils/panelManager.js
import { getDb } from '../../database.js';
import { CHANNELS, TOURNAMENT_STATUS_ICONS } from '../../config.js';
import { createGlobalAdminPanel, createTournamentManagementPanel } from './embeds.js';
import { isBotBusy } from '../../index.js';

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

export async function updateAdminPanel(client) {
    const msg = await fetchGlobalCreationPanel(client);
    if (!msg) return;
    const panelContent = createGlobalAdminPanel(isBotBusy);
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

// CORRECCIÓN DE RENDIMIENTO: Lógica reescrita para ser más eficiente.
export function updateTournamentChannelName(client) {
    // Se ejecuta sin async/await para no bloquear el hilo principal.
    // El cambio de nombre es una tarea de fondo.
    const db = getDb();
    db.collection('tournaments').find(
        { status: { $nin: ['finalizado', 'archivado', 'cancelado'] } },
        // Proyección para obtener solo los campos necesarios, mucho más rápido.
        { projection: { status: 1, 'teams.aprobados': 1, 'config.format.size': 1 } }
    ).toArray().then(activeTournaments => {
        let icon;
        
        const hasOpenForRegistration = activeTournaments.some(t => 
            t.status === 'inscripcion_abierta' && Object.keys(t.teams.aprobados).length < t.config.format.size
        );
        
        const hasFullOrInProgress = activeTournaments.some(t => 
            (t.status === 'inscripcion_abierta' && Object.keys(t.teams.aprobados).length >= t.config.format.size) ||
            !['inscripcion_abierta', 'finalizado', 'archivado', 'cancelado'].includes(t.status)
        );

        if (hasOpenForRegistration) {
            icon = '🟢';
        } else if (hasFullOrInProgress) {
            icon = '🔵';
        } else {
            icon = '🔴';
        }
        
        const newChannelName = `${icon} 📢-torneos-tournaments`;
        
        client.channels.fetch(CHANNELS.TORNEOS_STATUS).then(channel => {
            if (channel && channel.name !== newChannelName) {
                channel.setName(newChannelName.slice(0, 100)).catch(e => console.warn("Fallo al renombrar canal de estado:", e.message));
            }
        }).catch(e => console.warn("[WARN] No se pudo encontrar el canal de estado de torneos.", e.message));

    }).catch(e => console.error("Error al consultar torneos para actualizar nombre de canal:", e));
}
