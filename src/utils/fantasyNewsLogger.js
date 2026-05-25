import { getDb } from '../../database.js';

/**
 * Registra una noticia/notificación de transacción en la base de datos
 * @param {string} leagueId - ID de la liga afectada
 * @param {string} type - Tipo de evento ('clausulazo', 'fichaje', 'venta', 'oferta')
 * @param {string} message - Mensaje descriptivo
 * @param {object} metadata - Metadatos adicionales (opcional)
 */
export async function logFantasyNews(leagueId, type, message, metadata = {}) {
    try {
        const db = getDb();
        if (!db) return;

        const newsDoc = {
            leagueId: leagueId.toString(),
            type,
            message,
            metadata: {
                ...metadata,
                timestamp: new Date()
            },
            createdAt: new Date()
        };

        await db.collection('fantasy_news').insertOne(newsDoc);
        console.log(`[FANTASY NEWS] Evento registrado (${type}) en liga ${leagueId}: "${message}"`);
    } catch (e) {
        console.error('[FANTASY NEWS] Error al registrar evento:', e.message);
    }
}
