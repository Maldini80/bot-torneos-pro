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
// mientras processMatchResult + 100s de espera siguen en curso
const processingMatches = new Set();

// Cuántas horas atrás buscar partidos en la API de EA
const LOOKBACK_HOURS = 6;
// Intervalo de verificación en milisegundos (10 segundos)
const CHECK_INTERVAL_MS = 10000;

// Tiempo de gracia para considerar Rage-Quit / Abandono tras un DNF (25 minutos)
// Esto evita que si se desconectan al inicio de un partido y reinician, el bot valide
// el partido incompleto antes de que terminen de jugar el partido completo.
const DNF_GRACE_PERIOD_SECONDS = 1500;

/**
 * Inicia el intervalo de auto-detección de resultados.
 * Se ejecuta cada 20 segundos mientras esté activo.
 */
export function startAutoResults(client) {
    if (autoResultsInterval) {
        console.log('[AUTO-RESULTS] ⚠️ Ya está activo. No se inicia otro intervalo.');
        return false;
    }

    console.log('[AUTO-RESULTS] ▶️ Iniciando auto-detección de resultados (cada 10s)...');
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
 * 
 * Optimización: las llamadas a la API de EA se hacen en paralelo,
 * pero la validación de resultados se mantiene secuencial por torneo
 * para evitar race conditions en la BD.
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

        // Caché de respuestas de EA por clubId+platform para este ciclo.
        // Evita llamar dos veces a la misma URL si distintos partidos comparten un equipo.
        const eaCache = new Map();

        // Procesar torneos en paralelo (son documentos independientes en MongoDB)
        await Promise.all(tournaments.map(tournament =>
            processTournament(client, db, tournament, eaCache).catch(err => {
                console.error(`[AUTO-RESULTS] Error procesando torneo ${tournament.shortId}:`, err);
            })
        ));
    } finally {
        isChecking = false;
    }
}

/**
 * Procesa un torneo en dos fases:
 * - Fase 1 (paralela): Consultar EA API para todos los partidos activos a la vez
 * - Fase 2 (secuencial): Validar los resultados encontrados uno a uno
 */
async function processTournament(client, db, tournament, eaCache) {
    // Recoger todos los partidos activos (con hilo creado, sin finalizar)
    const activeMatches = collectActiveMatches(tournament);

    if (activeMatches.length === 0) return;

    // === FASE 1: Fetch paralelo de EA API + timestamps de hilos ===
    const matchDataPromises = activeMatches.map(({ partido }) =>
        fetchMatchData(client, tournament, partido, eaCache).catch(err => {
            console.error(`[AUTO-RESULTS] Error en fetch para partido ${partido.matchId}:`, err.message);
            return null;
        })
    );

    const matchDataResults = await Promise.all(matchDataPromises);

    // === FASE 2: Procesar resultados secuencialmente ===
    // Esto evita conflictos si dos partidos del mismo grupo se validan a la vez
    for (let i = 0; i < activeMatches.length; i++) {
        const data = matchDataResults[i];
        if (!data) continue; // fetch falló o no hay datos

        const { partido } = activeMatches[i];

        try {
            await processDetectedResult(client, db, tournament, partido, data);
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
 * Fase 1: Obtiene los datos de EA API y el timestamp del hilo para un partido.
 * Devuelve un objeto con los datos procesados o null si no hay resultado pendiente.
 * Esta función NO tiene efectos secundarios en la BD, es segura para paralelizar.
 */
async function fetchMatchData(client, tournament, partido, eaCache) {
    // Evitar procesar el mismo partido si ya está en curso de validación
    if (processingMatches.has(partido.matchId)) return null;

    // Obtener datos completos de los equipos desde el torneo
    const teamA = tournament.teams.aprobados[partido.equipoA.id || partido.equipoA.capitanId];
    const teamB = tournament.teams.aprobados[partido.equipoB.id || partido.equipoB.capitanId];

    if (!teamA?.eaClubId || !teamB?.eaClubId) return null;

    const platform = teamA.eaPlatform || teamB.eaPlatform || 'common-gen5';
    const clubIdA = teamA.eaClubId;
    const clubIdB = teamB.eaClubId;

    // Consultar EA API (con caché por clubId+platform para evitar llamadas duplicadas)
    const cacheKey = `${clubIdA}:${platform}`;
    let matches;

    if (eaCache.has(cacheKey)) {
        matches = eaCache.get(cacheKey);
    } else {
        const url = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${clubIdA}&platform=${platform}&matchType=friendlyMatch`;
        try {
            const res = await fetch(url, { headers: EA_HEADERS });
            if (!res.ok) return null;
            matches = await res.json();
            if (!Array.isArray(matches)) {
                matches = Object.values(matches || {});
            }
            // Guardar en caché para este ciclo
            eaCache.set(cacheKey, matches);
        } catch (err) {
            console.error(`[AUTO-RESULTS] Error consultando EA API para club ${clubIdA}:`, err.message);
            return null;
        }
    }

    // Obtener timestamp de creación del hilo (cacheado en el partido para evitar llamadas repetidas a Discord)
    let threadCreatedTimestampSecs = 0;
    if (partido._threadCreatedSecs) {
        // Usar valor cacheado de ciclos anteriores
        threadCreatedTimestampSecs = partido._threadCreatedSecs;
    } else {
        try {
            const thread = await client.channels.fetch(partido.threadId).catch(() => null);
            if (thread) {
                // Damos un margen de 10 minutos (600 segundos) antes de la creación del hilo, 
                // por si empezaron a jugar un poco antes de que se generara el hilo.
                threadCreatedTimestampSecs = Math.floor(thread.createdTimestamp / 1000) - 600;
                // Cachear en memoria para este ciclo y los siguientes
                partido._threadCreatedSecs = threadCreatedTimestampSecs;
            }
        } catch (e) {
            console.warn(`[AUTO-RESULTS] No se pudo obtener el hilo ${partido.threadId} para fecha de creación.`);
        }
    }

    // Filtrar: solo partidos entre estos dos clubs en las últimas LOOKBACK_HOURS horas
    const baseCutoff = Math.floor(Date.now() / 1000) - (LOOKBACK_HOURS * 3600);
    // Timestamp de activación del auto-resultado (si existe, ignora partidos antes de activarlo)
    const activatedAtSecs = tournament.config?.autoResultsActivatedAt || 0;
    // Y que estrictamente hayan sido jugados DESPUÉS de la creación del hilo (con margen de gracia)
    // Y DESPUÉS de que se activara el auto-resultado
    const finalCutoff = Math.max(baseCutoff, threadCreatedTimestampSecs, activatedAtSecs);

    const headToHead = matches.filter(match => {
        const clubsInvolved = Object.keys(match.clubs || {});
        return match.timestamp > finalCutoff &&
            clubsInvolved.includes(String(clubIdA)) &&
            clubsInvolved.includes(String(clubIdB));
    });

    if (headToHead.length === 0) return null;

    // Usar mergeSessions para fusionar DNFs y "dos primeras partes"
    // Esto usa TODA la lógica existente de extractMatchInfo (corrección 3-0 fantasma, etc.)
    const merged = mergeSessions(headToHead, clubIdA);

    if (merged.length === 0) return null;

    // Tomar el resultado más reciente (puede ser una sesión o la fusión de varias)
    const result = merged[0];

    return { result, clubIdA, clubIdB };
}

/**
 * Fase 2: Procesa un resultado detectado. Esta función SÍ modifica la BD y Discord,
 * por eso se ejecuta secuencialmente dentro de cada torneo.
 */
async function processDetectedResult(client, db, tournament, partido, data) {
    const { result } = data;
    const resultString = `${result.ourGoals}-${result.oppGoals}`;

    // === LÓGICA DE GRACIA PARA PARTIDOS INCOMPLETOS ===
    // EA timestamp is in seconds
    const latestSessionTimestamp = result.sessions[result.sessions.length - 1].timestamp;
    const secondsSinceLastPlay = Math.floor(Date.now() / 1000) - latestSessionTimestamp;
    
    // Consideramos "partido completo" si EA dice que no es DNF, O si entre todas las partes
    // fusionadas suman al menos 5400 segundos (90 minutos in-game)
    const isFullMatch = !result.isDnf || result.maxSecs >= 5400;
    
    // Consideramos "Rage-Quit/Abandono" si han pasado más de 25 minutos reales (1500 segundos)
    // desde la última vez que jugaron y no han empezado/terminado una nueva parte
    const hasRageQuit = secondsSinceLastPlay >= DNF_GRACE_PERIOD_SECONDS;

    if (!isFullMatch && !hasRageQuit) {
        // Aún no han jugado el partido completo y no ha transcurrido el tiempo de gracia (25 minutos).
        // El escáner los ignora momentáneamente para darles tiempo a jugar la "segunda parte" o reiniciar.
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
                        `✅ El resultado ha sido validado automáticamente. Este hilo se cerrará en 100 segundos.`
                });
            }
        } catch (notifyErr) {
            console.warn(`[AUTO-RESULTS] No se pudo notificar en el hilo ${partido.threadId}:`, notifyErr.message);
        }

        // Cerrar hilo a los 100 segundos (en vez de 10) en segundo plano para no bloquear la validación de otros partidos
        finalizeMatchThread(client, processedMatch, resultString, 100000).catch(err => {
            console.error(`[AUTO-RESULTS] Error cerrando hilo en segundo plano:`, err);
        });

        console.log(`[AUTO-RESULTS] ✅ Partido ${partido.matchId} finalizado automáticamente: ${resultString}`);
    } catch (processErr) {
        console.error(`[AUTO-RESULTS] Error al procesar resultado para ${partido.matchId}:`, processErr);
    } finally {
        processingMatches.delete(partido.matchId);
    }
}

export { checkAutoResults };
