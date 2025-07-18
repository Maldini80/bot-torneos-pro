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

export async function updateTournamentChannelName(client) {
    try {
        const db = getDb();
        const activeTournaments = await db.collection('tournaments').find({ status: { $nin: ['finalizado', 'archivado', 'cancelado'] } }).toArray();
        
        const openForRegistration = activeTournaments.filter(t => t.status === 'inscripcion_abierta' && Object.keys(t.teams.aprobados).length < t.config.format.size).length;
        const fullTournaments = activeTournaments.filter(t => t.status === 'inscripcion_abierta' && Object.keys(t.teams.aprobados).length >= t.config.format.size).length;
        const inProgress = activeTournaments.filter(t => !['inscripcion_abierta', 'finalizado', 'archivado', 'cancelado'].includes(t.status)).length;
        
        const statusParts = [];
        if (openForRegistration > 0) statusParts.push(`🟢${openForRegistration}`);
        if (fullTournaments > 0) statusParts.push(`🟠${fullTournaments}`);
        if (inProgress > 0) statusParts.push(`🔵${inProgress}`);
        
        const newChannelName = statusParts.length > 0 ? `[${statusParts.join('|')}] 📢 Torneos-Tournaments` : '[🔴] 📢 Torneos-Tournaments';
        
        const channel = await client.channels.fetch(CHANNELS.TORNEOS_STATUS);
        if (channel && channel.name !== newChannelName) {
            await channel.setName(newChannelName.slice(0, 100));
        }

        for (const tournament of activeTournaments) {
            if (tournament.discordMessageIds.publicInfoThreadId) {
                try {
                    const thread = await client.channels.fetch(tournament.discordMessageIds.publicInfoThreadId);
                    
                    let statusIcon = TOURNAMENT_STATUS_ICONS[tournament.status] || '❓';
                    if (tournament.status === 'inscripcion_abierta' && Object.keys(tournament.teams.aprobados).length >= tournament.config.format.size) {
                        statusIcon = TOURNAMENT_STATUS_ICONS['cupo_lleno'];
                    }

                    const newThreadName = `${statusIcon} ${tournament.nombre} - Info`;
                    if (thread.name !== newThreadName) {
                        await thread.setName(newThreadName.slice(0, 100));
                    }
                } catch (e) {
                    if (e.code !== 10003) console.warn(`No se pudo actualizar nombre de hilo público para ${tournament.shortId}`);
                }
            }
        }

    } catch (e) {
        console.warn("[WARN] No se pudo actualizar el nombre del canal de estado de torneos.", e.message);
    }
}
