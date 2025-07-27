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

// --- INICIO DE LA CORRECCIÓN ---
// CORRECCIÓN: Lógica de prioridad de iconos reescrita para ser más robusta.
export function updateTournamentChannelName(client) {
    // Se ejecuta sin async/await para no bloquear. Es una tarea de fondo.
    client.channels.fetch(CHANNELS.TORNEOS_STATUS)
        .then(async (channel) => {
            if (!channel) {
                console.warn("[WARN] No se pudo encontrar el canal de estado de torneos para renombrarlo.");
                return;
            }

            const messages = await channel.messages.fetch({ limit: 50 });
            // Filtramos por embeds que realmente tengan un título para evitar errores
            const tournamentEmbeds = messages.filter(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title);

            let icon = '🔴'; // Por defecto, rojo (sin torneos activos)

            if (tournamentEmbeds.size > 0) {
                const titles = tournamentEmbeds.map(m => m.embeds[0].title);

                // Prioridad 2: Comprobar si hay torneos en juego o llenos.
                // Si los hay, el icono base será azul.
                if (titles.some(title =>
                    title.startsWith(TOURNAMENT_STATUS_ICONS.cupo_lleno) ||
                    title.startsWith(TOURNAMENT_STATUS_ICONS.fase_de_grupos) ||
                    title.startsWith(TOURNAMENT_STATUS_ICONS.octavos) // Este icono '🟣' cubre cuartos, semis, etc.
                )) {
                    icon = '🔵';
                }
                
                // Prioridad 1: Comprobar si hay torneos con inscripción abierta.
                // Si los hay, esto SOBRESCRIBE cualquier otro estado. Es la máxima prioridad.
                if (titles.some(title => title.startsWith(TOURNAMENT_STATUS_ICONS.inscripcion_abierta))) {
                    icon = '🟢';
                }
            }

            const newChannelName = `${icon} 📢-torneos-tournaments`;
            if (channel.name !== newChannelName) {
                channel.setName(newChannelName.slice(0, 100)).catch(e => console.warn("Fallo al renombrar canal de estado:", e.message));
            }
        })
        .catch(e => console.warn("[WARN] Error crítico al intentar actualizar el nombre del canal de estado.", e.message));
}
// --- FIN DE LA CORRECCIÓN ---
