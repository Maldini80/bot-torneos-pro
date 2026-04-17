// src/utils/registrationListManager.js
// Sistema de canal de lista de inscritos para Draft Externo
// - Crea un canal público con embeds por posición + capitanes
// - Actualiza los embeds cuando hay cambios, con debounce anti-spam
// - Borra el canal al finalizar el torneo

import { EmbedBuilder, ChannelType, PermissionsBitField } from 'discord.js';
import { getDb } from '../../database.js';
import { TOURNAMENT_CATEGORY_ID } from '../../config.js';

// --- Constantes de posición ---
const POSITION_ORDER = ['GK', 'DFC', 'CARR', 'MC', 'DC'];
const POSITION_CONFIG = {
    GK:   { name: 'PORTEROS',    emoji: '🥅', color: '#f1c40f' },
    DFC:  { name: 'DEFENSAS',    emoji: '🧱', color: '#2ecc71' },
    CARR: { name: 'CARRILEROS',  emoji: '⚡', color: '#3498db' },
    MC:   { name: 'MEDIOS',      emoji: '🎩', color: '#e67e22' },
    DC:   { name: 'DELANTEROS',  emoji: '🏟️', color: '#e74c3c' }
};

// Max chars per embed description (Discord limit is 4096, we use 3800 for safety)
const MAX_EMBED_CHARS = 3800;
// Max players per embed before splitting
const MAX_PLAYERS_PER_EMBED = 25;

// --- Debounce system ---
const pendingUpdates = new Map(); // Map<tournamentId, { timer, firstCallTime }>
const DEBOUNCE_DELAY = 5000;  // 5 seconds
const DEBOUNCE_MAX   = 15000; // 15 seconds max wait

// Lock to prevent concurrent updates for the same tournament
const updateLocks = new Map();

/**
 * Schedule a debounced update for the registration list channel.
 * Multiple calls within 5s are grouped into one update.
 * After 15s from the first call, forces an update regardless.
 */
export function scheduleRegistrationListUpdate(client, tournamentShortId) {
    const existing = pendingUpdates.get(tournamentShortId);
    const now = Date.now();

    if (existing) {
        clearTimeout(existing.timer);

        // Force update if 15s have passed since first call
        const elapsed = now - existing.firstCallTime;
        if (elapsed >= DEBOUNCE_MAX) {
            pendingUpdates.delete(tournamentShortId);
            _executeUpdate(client, tournamentShortId);
            return;
        }

        // Reset timer with remaining max time
        const remainingMax = DEBOUNCE_MAX - elapsed;
        const delay = Math.min(DEBOUNCE_DELAY, remainingMax);

        existing.timer = setTimeout(() => {
            pendingUpdates.delete(tournamentShortId);
            _executeUpdate(client, tournamentShortId);
        }, delay);
    } else {
        // First call — set timer
        const timer = setTimeout(() => {
            pendingUpdates.delete(tournamentShortId);
            _executeUpdate(client, tournamentShortId);
        }, DEBOUNCE_DELAY);

        pendingUpdates.set(tournamentShortId, { timer, firstCallTime: now });
    }
}

/**
 * Execute the actual update (called by debounce or manual refresh)
 */
async function _executeUpdate(client, tournamentShortId) {
    // Prevent concurrent updates for the same tournament
    if (updateLocks.get(tournamentShortId)) {
        console.log(`[REG LIST] Update already running for ${tournamentShortId}, skipping.`);
        return;
    }

    updateLocks.set(tournamentShortId, true);
    try {
        await updateRegistrationListChannel(client, tournamentShortId);
    } catch (error) {
        console.error(`[REG LIST] Error updating registration list for ${tournamentShortId}:`, error);
    } finally {
        updateLocks.delete(tournamentShortId);
    }
}

// ==============================================
// CREATE CHANNEL + INITIAL EMBEDS
// ==============================================

/**
 * Creates the registration list channel and sends initial embeds.
 * @returns {{ channelId: string }} or null on failure
 */
export async function createRegistrationListChannel(client, guild, tournament) {
    const db = getDb();
    const shortName = tournament.nombre.substring(0, 20).replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    const channelName = `📋-inscritos-${shortName}`;

    try {
        // Create channel: everyone can view, nobody can send messages
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: TOURNAMENT_CATEGORY_ID,
            permissionOverwrites: [
                {
                    id: guild.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
                    deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions]
                }
            ]
        });

        // Build initial embeds from current DB state
        const { positionEmbeds, headerEmbed, captainsPendingEmbed, captainsApprovedEmbed } =
            await _buildAllEmbeds(tournament.shortId, tournament);

        // Send messages in order and save IDs
        const messages = {};
        const sleep = ms => new Promise(r => setTimeout(r, ms));

        // 1. Header
        const headerMsg = await channel.send({ embeds: [headerEmbed] });
        messages.header = headerMsg.id;
        await sleep(700);

        // 2. Position embeds (one or more per position)
        for (const pos of POSITION_ORDER) {
            messages[pos] = [];
            const embeds = positionEmbeds[pos];
            for (const embed of embeds) {
                const msg = await channel.send({ embeds: [embed] });
                messages[pos].push(msg.id);
                await sleep(700);
            }
        }

        // 3. Captains Pending
        const capPendMsg = await channel.send({ embeds: [captainsPendingEmbed] });
        messages.captainsPending = capPendMsg.id;
        await sleep(700);

        // 4. Captains Approved
        const capApprMsg = await channel.send({ embeds: [captainsApprovedEmbed] });
        messages.captainsApproved = capApprMsg.id;

        // Save to DB
        const registrationListData = {
            channelId: channel.id,
            messages
        };

        await db.collection('tournaments').updateOne(
            { shortId: tournament.shortId },
            { $set: { registrationListData } }
        );

        console.log(`[REG LIST] ✅ Canal creado: ${channel.id} para ${tournament.nombre}`);
        return { channelId: channel.id };

    } catch (error) {
        console.error(`[REG LIST] ❌ Error creando canal:`, error);
        return null;
    }
}

// ==============================================
// UPDATE ALL EMBEDS (called by debounce)
// ==============================================

/**
 * Updates all embeds in the registration list channel.
 * Handles overflow (position needs more/fewer messages) by deleting all and re-sending in order.
 */
export async function updateRegistrationListChannel(client, tournamentShortId) {
    const db = getDb();
    const tournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });
    if (!tournament || !tournament.registrationListData) return;

    const { channelId, messages } = tournament.registrationListData;
    if (!channelId || !messages) return;

    let channel;
    try {
        channel = await client.channels.fetch(channelId);
        if (!channel) return;
    } catch (e) {
        console.warn(`[REG LIST] Canal ${channelId} no encontrado, limpiando datos.`);
        await db.collection('tournaments').updateOne(
            { shortId: tournamentShortId },
            { $unset: { registrationListData: '' } }
        );
        return;
    }

    // Build new embeds
    const { positionEmbeds, headerEmbed, captainsPendingEmbed, captainsApprovedEmbed } =
        await _buildAllEmbeds(tournamentShortId, tournament);

    // Check if structure changed (different number of messages per position)
    let structureChanged = false;
    for (const pos of POSITION_ORDER) {
        const currentCount = messages[pos]?.length || 0;
        const newCount = positionEmbeds[pos].length;
        if (currentCount !== newCount) {
            structureChanged = true;
            break;
        }
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    if (structureChanged) {
        // SLOW PATH: Delete all messages and re-send in order
        console.log(`[REG LIST] Estructura cambiada para ${tournamentShortId}, re-creando mensajes...`);
        try {
            // Collect all message IDs to delete
            const allMsgIds = [];
            if (messages.header) allMsgIds.push(messages.header);
            for (const pos of POSITION_ORDER) {
                if (messages[pos]) allMsgIds.push(...messages[pos]);
            }
            if (messages.captainsPending) allMsgIds.push(messages.captainsPending);
            if (messages.captainsApproved) allMsgIds.push(messages.captainsApproved);

            // Bulk delete (max 100, max 14 days old)
            if (allMsgIds.length > 0) {
                await channel.bulkDelete(allMsgIds.length, true).catch(() => {
                    // If bulkDelete fails (messages too old), delete individually
                    return Promise.all(allMsgIds.map(id =>
                        channel.messages.fetch(id).then(m => m.delete()).catch(() => { })
                    ));
                });
            }
            await sleep(1000);

            // Re-send everything in order
            const newMessages = {};

            const headerMsg = await channel.send({ embeds: [headerEmbed] });
            newMessages.header = headerMsg.id;
            await sleep(700);

            for (const pos of POSITION_ORDER) {
                newMessages[pos] = [];
                for (const embed of positionEmbeds[pos]) {
                    const msg = await channel.send({ embeds: [embed] });
                    newMessages[pos].push(msg.id);
                    await sleep(700);
                }
            }

            const capPendMsg = await channel.send({ embeds: [captainsPendingEmbed] });
            newMessages.captainsPending = capPendMsg.id;
            await sleep(700);

            const capApprMsg = await channel.send({ embeds: [captainsApprovedEmbed] });
            newMessages.captainsApproved = capApprMsg.id;

            // Update DB with new message IDs
            await db.collection('tournaments').updateOne(
                { shortId: tournamentShortId },
                { $set: { 'registrationListData.messages': newMessages } }
            );

        } catch (error) {
            console.error(`[REG LIST] Error en re-creación de mensajes:`, error);
        }
    } else {
        // FAST PATH: Edit existing messages in place
        try {
            // Edit header
            if (messages.header) {
                const msg = await channel.messages.fetch(messages.header).catch(() => null);
                if (msg) await msg.edit({ embeds: [headerEmbed] });
                await sleep(700);
            }

            // Edit position embeds
            for (const pos of POSITION_ORDER) {
                const msgIds = messages[pos] || [];
                const embeds = positionEmbeds[pos];
                for (let i = 0; i < msgIds.length; i++) {
                    const msg = await channel.messages.fetch(msgIds[i]).catch(() => null);
                    if (msg && embeds[i]) {
                        await msg.edit({ embeds: [embeds[i]] });
                        await sleep(700);
                    }
                }
            }

            // Edit captains
            if (messages.captainsPending) {
                const msg = await channel.messages.fetch(messages.captainsPending).catch(() => null);
                if (msg) await msg.edit({ embeds: [captainsPendingEmbed] });
                await sleep(700);
            }

            if (messages.captainsApproved) {
                const msg = await channel.messages.fetch(messages.captainsApproved).catch(() => null);
                if (msg) await msg.edit({ embeds: [captainsApprovedEmbed] });
            }

        } catch (error) {
            console.error(`[REG LIST] Error editando mensajes:`, error);
        }
    }
}

// ==============================================
// DELETE CHANNEL
// ==============================================

/**
 * Deletes the registration list channel and cleans up DB.
 */
export async function deleteRegistrationListChannel(client, tournament) {
    const db = getDb();

    if (!tournament.registrationListData?.channelId) return;

    try {
        const channel = await client.channels.fetch(tournament.registrationListData.channelId).catch(() => null);
        if (channel) {
            await channel.delete('Lista de inscritos eliminada').catch(e =>
                console.warn(`[REG LIST] Error eliminando canal:`, e.message)
            );
        }
    } catch (e) {
        console.warn(`[REG LIST] Canal ya no existe:`, e.message);
    }

    await db.collection('tournaments').updateOne(
        { shortId: tournament.shortId },
        { $unset: { registrationListData: '' } }
    );

    console.log(`[REG LIST] Canal y datos eliminados para ${tournament.nombre}`);
}

// ==============================================
// FORCE REFRESH (manual button)
// ==============================================

/**
 * Forces an immediate update, bypassing debounce.
 */
export async function forceRefreshRegistrationList(client, tournamentShortId) {
    // Cancel any pending debounce
    const pending = pendingUpdates.get(tournamentShortId);
    if (pending) {
        clearTimeout(pending.timer);
        pendingUpdates.delete(tournamentShortId);
    }

    await _executeUpdate(client, tournamentShortId);
}

// ==============================================
// INTERNAL: Build all embeds from DB state
// ==============================================

async function _buildAllEmbeds(tournamentShortId, tournament) {
    const db = getDb();

    // --- Fetch players ---
    const registrations = await db.collection('external_draft_registrations')
        .find({ tournamentId: tournamentShortId })
        .sort({ createdAt: 1 })
        .toArray();

    // Group by position
    const groups = {};
    POSITION_ORDER.forEach(pos => groups[pos] = []);
    registrations.forEach(r => {
        if (groups[r.position]) groups[r.position].push(r);
    });

    const totalPlayers = registrations.length;

    // --- Build position embeds ---
    const positionEmbeds = {};
    for (const pos of POSITION_ORDER) {
        positionEmbeds[pos] = _buildPositionEmbeds(pos, groups[pos]);
    }

    // --- Build header embed ---
    const regPlayersOpen = tournament.registrationsClosed === false;
    const regPlayersClosed = tournament.registrationsClosed === true;
    const regCaptainsClosed = tournament.config?.registrationClosed === true;

    let playersStatus, captainsStatus;
    if (regPlayersOpen) playersStatus = '🟢 ABIERTAS';
    else if (regPlayersClosed) playersStatus = '🔴 CERRADAS';
    else playersStatus = '⚪ SIN ABRIR';

    captainsStatus = regCaptainsClosed ? '🔴 CERRADAS' : '🟢 ABIERTAS';

    const statsLine = POSITION_ORDER.map(pos => {
        const cfg = POSITION_CONFIG[pos];
        return `${cfg.emoji} ${groups[pos].length} ${pos}`;
    }).join(' · ');

    const headerEmbed = new EmbedBuilder()
        .setColor('#2f3136')
        .setTitle(`📋 Lista de Inscritos — ${tournament.nombre}`)
        .setDescription(
            `**Inscripciones Jugadores (Web):** ${playersStatus}\n` +
            `**Inscripciones Capitanes (Discord):** ${captainsStatus}\n\n` +
            `📊 **${totalPlayers} jugadores inscritos**\n${statsLine}`
        )
        .setTimestamp()
        .setFooter({ text: 'Última actualización' });

    if (process.env.BASE_URL) {
        headerEmbed.addFields({
            name: '🔗 Inscripción Web',
            value: `${process.env.BASE_URL}/inscripcion/${tournamentShortId}`,
            inline: false
        });
    }

    // --- Build captains embeds ---
    // Refresh tournament data for captains
    const freshTournament = await db.collection('tournaments').findOne({ shortId: tournamentShortId });

    // Pending captains (from pendingApproval, pendingPayments, pendientes)
    const pendingCaptains = [];
    const addPending = (list, source) => {
        if (!list) return;
        Object.values(list).forEach(data => {
            pendingCaptains.push({
                name: data.nombre || data.teamName || data.ownerName || 'Sin Nombre',
                tag: data.capitanTag || data.userTag || '',
                source
            });
        });
    };
    addPending(freshTournament.teams?.pendingApproval, 'Pendiente');
    addPending(freshTournament.teams?.pendingPayments, 'Pago Pendiente');
    addPending(freshTournament.teams?.pendientes, 'Pendiente');

    let pendingDesc = pendingCaptains.length === 0
        ? '*No hay capitanes pendientes actualmente.*'
        : pendingCaptains.map((c, i) =>
            `${i + 1}. **${c.name}**\n└ ${c.tag} _(${c.source})_`
        ).join('\n\n');

    if (pendingDesc.length > MAX_EMBED_CHARS) {
        pendingDesc = pendingDesc.substring(0, MAX_EMBED_CHARS) + '\n...';
    }

    const captainsPendingEmbed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(`⏳ Capitanes Pendientes (${pendingCaptains.length})`)
        .setDescription(pendingDesc);

    // Approved captains
    const approvedCaptains = Object.values(freshTournament.teams?.aprobados || {});
    let approvedDesc = approvedCaptains.length === 0
        ? '*No hay capitanes aprobados aún.*'
        : approvedCaptains.map((team, i) =>
            `${i + 1}. **${team.nombre}**\n└ Capitán: ${team.capitanTag || 'N/A'}`
        ).join('\n\n');

    if (approvedDesc.length > MAX_EMBED_CHARS) {
        approvedDesc = approvedDesc.substring(0, MAX_EMBED_CHARS) + '\n...';
    }

    const captainsApprovedEmbed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`✅ Capitanes Aprobados (${approvedCaptains.length})`)
        .setDescription(approvedDesc);

    return { positionEmbeds, headerEmbed, captainsPendingEmbed, captainsApprovedEmbed };
}

/**
 * Build one or more embeds for a single position.
 * Splits into multiple embeds if too many players.
 */
function _buildPositionEmbeds(position, players) {
    const config = POSITION_CONFIG[position];

    if (players.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(config.color)
            .setTitle(`${config.emoji} ${config.name} (0)`)
            .setDescription('*Sin jugadores inscritos en esta posición.*');
        return [embed];
    }

    // Format player entries
    const entries = players.map((player, index) => {
        const num = index + 1;
        // Escapar caracteres especiales de markdown de Discord (_, *, ~, `, |) para que se vean tal cual
        const safeGameId = player.gameId ? player.gameId.replace(/([_*~`|])/g, '\\$1') : 'Sin ID';
        return `**${num}.** ${safeGameId}\n📲 ${player.whatsapp}`;
    });

    // Split into chunks if needed
    const chunks = [];
    let currentChunk = [];
    let currentLength = 0;

    for (const entry of entries) {
        const entryLength = entry.length + 2; // +2 for \n\n separator
        if (currentChunk.length >= MAX_PLAYERS_PER_EMBED ||
            currentLength + entryLength > MAX_EMBED_CHARS) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentLength = 0;
        }
        currentChunk.push(entry);
        currentLength += entryLength;
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    // Build embeds for each chunk
    const embeds = chunks.map((chunk, chunkIndex) => {
        const isMulti = chunks.length > 1;
        const title = isMulti
            ? `${config.emoji} ${config.name} (${chunkIndex + 1}/${chunks.length}) — ${players.length} total`
            : `${config.emoji} ${config.name} (${players.length})`;

        // Adjust numbering for multi-page
        let description;
        if (isMulti && chunkIndex > 0) {
            // Re-number entries for continuation pages
            const startNum = chunks.slice(0, chunkIndex).reduce((sum, c) => sum + c.length, 0);
            description = chunk.map((entry, i) => {
                // Replace the leading number
                return entry.replace(/^\*\*\d+\.\*\*/, `**${startNum + i + 1}.**`);
            }).join('\n\n');
        } else {
            description = chunk.join('\n\n');
        }

        return new EmbedBuilder()
            .setColor(config.color)
            .setTitle(title)
            .setDescription(description);
    });

    return embeds;
}
