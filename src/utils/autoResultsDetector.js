// src/utils/autoResultsDetector.js
import { getDb } from '../../database.js';
import { extractMatchInfo, mergeSessions } from './matchUtils.js';
import { processMatchResult, finalizeMatchThread } from '../logic/matchLogic.js';

const EA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.ea.com/"
};

let autoResultsInterval = null;
let isChecking = false;
// Set para evitar procesar el mismo partido dos veces si el intervalo se ejecuta
// mientras processMatchResult + 60s de espera siguen en curso
const processingMatches = new Set();

// Cuántas horas atrás buscar partidos en la API de EA
const LOOKBACK_HOURS = 6;
// Intervalo de verificación en milisegundos (90 segundos)
const CHECK_INTERVAL_MS = 90000;

/**
 * Inicia el intervalo de auto-detección de resultados.
 * Se ejecuta cada 90 segundos mientras esté activo.
 */
export function startAutoResults(client) {
    if (autoResultsInterval) {
        console.log('[AUTO-RESULTS] ⚠️ Ya está activo. No se inicia otro intervalo.');
        return false;
    }

    console.log('[AUTO-RESULTS] ▶️ Iniciando auto-detección de resultados (cada 90s)...');
    autoResultsInterval = setInterval(() => {
        checkAutoResults(client).catch(err => {
            console.error('[AUTO-RESULTS] Error en ciclo de verificación:', err);
        });
    }, CHECK_INTERVAL_MS);

    // Ejecutar una vez inmediatamente
    checkAutoResults(client).catch(err => {
        console.error('[AUTO-RESULTS] Error en primera verificación:', err);
    });

    return true;
}

/**
 * Detiene el intervalo de auto-detección.
 */
export function stopAutoResults() {
    if (autoResultsInterval) {
        clearInterval(autoResultsInterval);
        autoResultsInterval = null;
        console.log('[AUTO-RESULTS] ⏹️ Auto-detección detenida.');
        return true;
    }
    return false;
}

/**
 * Devuelve si el auto-detector está activo.
 */
export function isAutoResultsActive() {
    return autoResultsInterval !== null;
}

/**
 * Función principal: revisa todos los partidos con hilo activo en torneos
 * con autoResults habilitado y busca resultados en la API de EA.
 */
async function checkAutoResults(client) {
    if (isChecking) return; // Evitar ejecuciones solapadas
    isChecking = true;

    try {
        const db = getDb();
        if (!db) return;

        // 1. Buscar torneos activos con autoResults habilitado
        const tournaments = await db.collection('tournaments').find({
            'config.autoResults': true,
            status: { $nin: ['finalizado', 'cancelado', 'inscripcion_abierta', 'archivado'] }
        }).toArray();

        if (tournaments.length === 0) return;

        for (const tournament of tournaments) {
            try {
                await processTournament(client, db, tournament);
            } catch (err) {
                console.error(`[AUTO-RESULTS] Error procesando torneo ${tournament.shortId}:`, err);
            }
        }
    } finally {
        isChecking = false;
    }
}

/**
 * Procesa un torneo: busca partidos en_curso con hilo creado y sin resultado.
 */
async function processTournament(client, db, tournament) {
    // Recoger todos los partidos activos (con hilo creado, sin finalizar)
    const activeMatches = collectActiveMatches(tournament);

    if (activeMatches.length === 0) return;

    console.log(`[AUTO-RESULTS] Torneo "${tournament.nombre}" (${tournament.shortId}): ${activeMatches.length} partido(s) activo(s) para verificar.`);

    for (const { partido, fase } of activeMatches) {
        try {
            await checkMatchResult(client, db, tournament, partido);
        } catch (err) {
            console.error(`[AUTO-RESULTS] Error verificando partido ${partido.matchId}:`, err);
        }
    }
}

/**
 * Recoge todos los partidos con status 'en_curso', threadId no nulo, y sin resultado.
 */
function collectActiveMatches(tournament) {
    const matches = [];

    // Fase de grupos (calendario)
    if (tournament.structure.calendario) {
        for (const groupName in tournament.structure.calendario) {
            for (const match of tournament.structure.calendario[groupName]) {
                if (isMatchActive(match)) {
                    matches.push({ partido: match, fase: 'grupos' });
                }
            }
        }
    }

    // Eliminatorias
    if (tournament.structure.eliminatorias) {
        for (const stage of Object.keys(tournament.structure.eliminatorias)) {
            if (stage === 'rondaActual') continue;
            const stageData = tournament.structure.eliminatorias[stage];
            if (!stageData) continue;

            if (Array.isArray(stageData)) {
                for (const match of stageData) {
                    if (match && isMatchActive(match)) {
                        matches.push({ partido: match, fase: stage });
                    }
                }
            } else if (stageData.matchId && isMatchActive(stageData)) {
                matches.push({ partido: stageData, fase: stage });
            }
        }
    }

    return matches;
}

/**
 * Un partido está activo si tiene hilo creado, está en_curso, y no tiene resultado.
 */
function isMatchActive(match) {
    return match &&
        match.threadId &&
        match.status === 'en_curso' &&
        !match.resultado &&
        match.equipoA?.id !== 'ghost' &&
        match.equipoB?.id !== 'ghost';
}

/**
 * Verifica un partido individual: busca en EA API si los dos clubes han jugado recientemente.
 */
async function checkMatchResult(client, db, tournament, partido) {
    // Evitar procesar el mismo partido si ya está en curso
    if (processingMatches.has(partido.matchId)) return;

    // Obtener datos completos de los equipos desde el torneo
    const teamA = tournament.teams.aprobados[partido.equipoA.id || partido.equipoA.capitanId];
    const teamB = tournament.teams.aprobados[partido.equipoB.id || partido.equipoB.capitanId];

    if (!teamA?.eaClubId || !teamB?.eaClubId) return;

    const platform = teamA.eaPlatform || teamB.eaPlatform || 'common-gen5';
    const clubIdA = teamA.eaClubId;
    const clubIdB = teamB.eaClubId;

    // Consultar EA API para partidos recientes del equipo A
    const url = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${clubIdA}&platform=${platform}&matchType=friendlyMatch`;

    let matches;
    try {
        const res = await fetch(url, { headers: EA_HEADERS });
        if (!res.ok) return;
        matches = await res.json();
        if (!Array.isArray(matches)) {
            matches = Object.values(matches || {});
        }
    } catch (err) {
        console.error(`[AUTO-RESULTS] Error consultando EA API para club ${clubIdA}:`, err.message);
        return;
    }

    // Filtrar: solo partidos entre estos dos clubs en las últimas LOOKBACK_HOURS horas
    const cutoff = Math.floor(Date.now() / 1000) - (LOOKBACK_HOURS * 3600);
    const headToHead = matches.filter(match => {
        const clubsInvolved = Object.keys(match.clubs || {});
        return match.timestamp > cutoff &&
            clubsInvolved.includes(String(clubIdA)) &&
            clubsInvolved.includes(String(clubIdB));
    });

    if (headToHead.length === 0) return;

    // Usar mergeSessions para fusionar DNFs y "dos primeras partes"
    // Esto usa TODA la lógica existente de extractMatchInfo (corrección 3-0 fantasma, etc.)
    const merged = mergeSessions(headToHead, clubIdA);

    if (merged.length === 0) return;

    // Tomar el resultado más reciente (puede ser una sesión o la fusión de varias)
    const result = merged[0];
    const resultString = `${result.ourGoals}-${result.oppGoals}`;

    // === LÓGICA DE GRACIA PARA PARTIDOS INCOMPLETOS ===
    // EA timestamp is in seconds
    const latestSessionTimestamp = result.sessions[result.sessions.length - 1].timestamp;
    const secondsSinceLastPlay = Math.floor(Date.now() / 1000) - latestSessionTimestamp;
    
    // Consideramos "partido completo" si EA dice que no es DNF, O si entre todas las partes
    // fusionadas suman al menos 4800 segundos (80 minutos in-game)
    const isFullMatch = !result.isDnf || result.maxSecs >= 4800;
    
    // Consideramos "Rage-Quit/Abandono" si han pasado más de 25 minutos reales (1500 segundos)
    // desde la última vez que jugaron y no han empezado/terminado una nueva parte
    const hasRageQuit = secondsSinceLastPlay >= 1500;

    if (!isFullMatch && !hasRageQuit) {
        // Aún no han jugado 80 minutos en total y han pasado menos de 25 min reales.
        // El escáner de 90s los ignora momentáneamente para darles tiempo a jugar la "segunda parte".
        // console.log(`[AUTO-RESULTS] Partido incompleto detectado (${result.maxSecs}s jugados). Esperando segunda parte...`);
        return;
    }
    // ===================================================

    // === DETECCIÓN DE PRÓRROGA ===
    // Si algún jugador jugó más de 93 minutos, es probable que hayan jugado prórroga.
    // No auto-validar: el resultado incluye goles de tiempo extra que no cuentan en liga.
    if (result.hasExtraTime) {
        console.log(`[AUTO-RESULTS] ⚠️ Prórroga detectada en partido ${partido.matchId} (${resultString}). No se auto-valida.`);
        
        try {
            const thread = await client.channels.fetch(partido.threadId).catch(() => null);
            if (thread) {
                await thread.send({
                    content: `⚠️ **Posible prórroga detectada**\n\n` +
                        `Se ha detectado que el partido superó el minuto 93. Es posible que se haya jugado prórroga.\n\n` +
                        `📊 Resultado detectado (puede incluir prórroga): ${partido.equipoA.nombre} **${resultString}** ${partido.equipoB.nombre}\n\n` +
                        `⚠️ **Este resultado NO se ha validado automáticamente.**\n` +
                        `Un administrador debe verificar el resultado del minuto 90 y validarlo manualmente.`
                });
            }
        } catch (notifyErr) {
            console.warn(`[AUTO-RESULTS] No se pudo notificar prórroga en hilo ${partido.threadId}:`, notifyErr.message);
        }
        
        return;
    }
    // ================================

    console.log(`[AUTO-RESULTS] 🎯 Resultado detectado para partido ${partido.matchId}: ${partido.equipoA.nombre} ${resultString} ${partido.equipoB.nombre}`);

    // Re-leer el torneo para asegurar datos frescos (evitar race condition con validación manual)
    const freshTournament = await db.collection('tournaments').findOne({ _id: tournament._id });
    if (!freshTournament) return;

    // Verificar que el partido sigue activo (un capitán pudo haber validado mientras tanto)
    const { findMatch } = await import('../logic/matchLogic.js');
    const { partido: freshPartido } = findMatch(freshTournament, partido.matchId);
    if (!freshPartido || freshPartido.status === 'finalizado' || freshPartido.resultado) {
        console.log(`[AUTO-RESULTS] Partido ${partido.matchId} ya fue finalizado manualmente. Ignorando.`);
        return;
    }

    // Procesar el resultado
    const guild = await client.guilds.fetch(freshTournament.guildId).catch(() => null);
    if (!guild) return;

    // Marcar como en proceso para evitar duplicados
    processingMatches.add(partido.matchId);

    try {
        const processedMatch = await processMatchResult(client, guild, freshTournament, partido.matchId, resultString);

        // Notificar en el hilo del partido
        try {
            const thread = await client.channels.fetch(partido.threadId).catch(() => null);
            if (thread) {
                await thread.send({
                    content: `🤖 **Resultado auto-detectado por EA Stats:** ${partido.equipoA.nombre} **${resultString}** ${partido.equipoB.nombre}\n\n` +
                        `✅ El resultado ha sido validado automáticamente. Este hilo se cerrará en 60 segundos.`
                });
            }
        } catch (notifyErr) {
            console.warn(`[AUTO-RESULTS] No se pudo notificar en el hilo ${partido.threadId}:`, notifyErr.message);
        }

        // Cerrar hilo a los 60 segundos (en vez de 10)
        await finalizeMatchThread(client, processedMatch, resultString, 60000);

        console.log(`[AUTO-RESULTS] ✅ Partido ${partido.matchId} finalizado automáticamente: ${resultString}`);
    } catch (processErr) {
        console.error(`[AUTO-RESULTS] Error al procesar resultado para ${partido.matchId}:`, processErr);
    } finally {
        processingMatches.delete(partido.matchId);
    }
}

export { checkAutoResults };
