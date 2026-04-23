// src/utils/eaStatsQueue.js
import { fetchAndAggregateStats } from './eaStatsFetcher.js';
import { getDb, getBotSettings } from '../../database.js';

/**
 * Sistema centralizado para gestionar las peticiones a la API de EA.
 * Evita bloqueos de rate limit encolando todas las peticiones globales del bot.
 */

const queue = [];
let isProcessing = false;
let workerInterval = null;

// Cuánto tiempo (ms) esperar después de un partido terminado para consultar estadísticas.
// Por defecto 4 minutos = 240,000 ms.
const GRACE_PERIOD_MS = 240000; 
// Cuánto tiempo (ms) pausar entre consultas reales a la API.
const COOLDOWN_MS = 3000;

export function addJob(matchId, tournamentShortId, matchPath, clubIdA, clubIdB, platformIdA, platformIdB) {
    // Escogemos la plataforma predominante o la primera disponible.
    const platform = platformIdA || platformIdB || 'common-gen5';
    
    queue.push({
        matchId,
        tournamentShortId,
        matchPath,
        clubIdA,
        clubIdB,
        platform,
        addedAt: Date.now(),
        processAt: Date.now() + GRACE_PERIOD_MS
    });

    console.log(`[EA_QUEUE] Trabajo añadido para partido ${matchId} (vs EA Club ${clubIdA} - ${clubIdB}). Será procesado en 4 mins.`);

    if (!workerInterval) {
        startWorker();
    }
}

function startWorker() {
    console.log('[EA_QUEUE] Iniciando trabajador asíncrono.');
    // Revisar la cola cada 15 segundos
    workerInterval = setInterval(processQueue, 15000);
}

async function processQueue() {
    if (isProcessing || queue.length === 0) return;

    const now = Date.now();
    // Encontramos el primer trabajo que ya cumplió el tiempo de gracia
    const jobIndex = queue.findIndex(job => job.processAt <= now);
    
    if (jobIndex === -1) return; // Ningún trabajo está listo todavía

    isProcessing = true;
    const job = queue.splice(jobIndex, 1)[0];

    try {
        console.log(`[EA_QUEUE] Procesando partido ${job.matchId} de torneo ${job.tournamentShortId}...`);

        const stats = await fetchAndAggregateStats(job.clubIdA, job.clubIdB, job.platform, 3);
        
        if (stats) {
            console.log(`[EA_QUEUE] Estadísticas obtenidas para ${job.matchId}. Inyectando en la BD...`);
            
            const db = getDb();
            // Update atómico
            const setKey = `${job.matchPath}.eaStats`;
            
            await db.collection('tournaments').updateOne(
                { shortId: job.tournamentShortId },
                { $set: { [setKey]: stats } }
            );

            console.log(`[EA_QUEUE] Estadísticas inyectadas exitosamente para ${job.matchId}.`);
        } else {
            console.log(`[EA_QUEUE] No se encontraron estadísticas recientes para ${job.matchId}.`);
        }

    } catch (error) {
        console.error(`[EA_QUEUE] Error al procesar el trabajo para ${job.matchId}:`, error);
    } finally {
        // Pausa de seguridad antes de permitir procesar el siguiente
        setTimeout(() => {
            isProcessing = false;
        }, COOLDOWN_MS);
    }
}

// Inicializar el trabajador al cargar el módulo, por si hay trabajos persistidos (opcional futuro)
if (queue.length > 0 && !workerInterval) {
    startWorker();
}
