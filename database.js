// database.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    throw new Error('DATABASE_URL no está definida en las variables de entorno de Render.');
}
const client = new MongoClient(dbUrl);
let db;

export async function connectDb() {
    try {
        await client.connect();
        db = client.db('tournamentBotDb');
        console.log('[DATABASE] Conectado exitosamente a MongoDB Atlas.');
        await getBotSettings();

        // --- INICIO DE LA MODIFICACIÓN ---
        const reputationCollection = db.collection('playerReputation');
        await reputationCollection.createIndex({ playerId: 1 }, { unique: true });
        await reputationCollection.createIndex({ psnId: 1 });
        console.log('[DATABASE] Índices para playerReputation asegurados.');
        // --- FIN DE LA MODIFICACIÓN ---
    } catch (err) {
        console.error('[DATABASE] ERROR FATAL AL CONECTAR CON MONGODB:', err);
        process.exit(1);
    }
}

export function getDb() {
    if (!db) {
        throw new Error('La base de datos no ha sido conectada todavía.');
    }
    return db;
}

const defaultBotSettings = {
    _id: 'global_config',
    translationEnabled: true,
    twitterEnabled: true,
};

export async function getBotSettings() {
    if (!db) await connectDb();
    const settingsCollection = db.collection('bot_settings');
    let settings = await settingsCollection.findOne({ _id: 'global_config' });

    if (!settings) {
        console.log('[DATABASE] No se encontró configuración global, creando una por defecto...');
        await settingsCollection.insertOne(defaultBotSettings);
        settings = defaultBotSettings;
    }

    return settings;
}

export async function updateBotSettings(newSettings) {
    if (!db) await connectDb();
    const settingsCollection = db.collection('bot_settings');
    return settingsCollection.updateOne({ _id: 'global_config' }, { $set: newSettings });
}

// --- INICIO DE LA MODIFICACIÓN ---
/**
 * Obtiene o crea el perfil de reputación de un jugador.
 * @param {string} playerId - La ID de Discord del jugador.
 * @param {string} psnId - El PSN ID del jugador.
 * @returns {Promise<object>} El perfil de reputación del jugador.
 */
export async function getOrRegisterPlayerReputation(playerId, psnId) {
    if (!db) await connectDb();
    const reputationCollection = db.collection('playerReputation');
    
    let reputation = await reputationCollection.findOne({ playerId });
    if (!reputation) {
        const newReputationProfile = {
            playerId,
            psnId,
            strikes: 0,
            draftsPlayedSinceLastStrike: 0,
            reportHistory: [], // { reporterId, reporterPsn, draftId, reason, timestamp }
            isVetted: false,
        };
        await reputationCollection.insertOne(newReputationProfile);
        return newReputationProfile;
    }
    
    if (reputation.psnId !== psnId) {
        await reputationCollection.updateOne({ playerId }, { $set: { psnId } });
        reputation.psnId = psnId;
    }
    return reputation;
}

/**
 * Añade un strike a un jugador y actualiza su historial.
 * @param {string} targetPlayerId - La ID del jugador reportado.
 * @param {object} reporter - El objeto del capitán que reporta.
 * @param {string} draftId - La ID del draft en el que ocurre el reporte.
 * @param {string} reason - El motivo del reporte.
 * @returns {Promise<boolean>} True si el jugador queda vetado tras el strike.
 */
export async function addStrikeToPlayer(targetPlayerId, reporter, draftId, reason) {
    if (!db) await connectDb();
    const reputationCollection = db.collection('playerReputation');
    
    const updateResult = await reputationCollection.findOneAndUpdate(
        { playerId: targetPlayerId },
        {
            $inc: { strikes: 1 },
            $set: { draftsPlayedSinceLastStrike: 0 },
            $push: {
                reportHistory: {
                    reporterId: reporter.userId,
                    reporterPsn: reporter.psnId,
                    draftId,
                    reason,
                    timestamp: new Date()
                }
            }
        },
        { returnDocument: 'after' } // Devuelve el documento después de actualizar
    );

    const newStrikes = updateResult.value.strikes;
    const isNowVetted = newStrikes >= 2;

    if (updateResult.value.isVetted !== isNowVetted) {
        await reputationCollection.updateOne({ playerId: targetPlayerId }, { $set: { isVetted: isNowVetted } });
    }
    
    return isNowVetted;
}

/**
 * Actualiza el contador de drafts jugados para la limpieza de strikes.
 * @param {string[]} playerIds - Array de IDs de todos los jugadores que participaron.
 */
export async function incrementDraftsPlayedForStrikeRemoval(playerIds) {
    if (!db) await connectDb();
    const reputationCollection = db.collection('playerReputation');

    // Incrementar el contador para jugadores con 1 strike
    await reputationCollection.updateMany(
        { playerId: { $in: playerIds }, strikes: 1 },
        { $inc: { draftsPlayedSinceLastStrike: 1 } }
    );
    
    // Limpiar el strike si han jugado 2 drafts sin incidentes
    await reputationCollection.updateMany(
        { strikes: 1, draftsPlayedSinceLastStrike: { $gte: 2 } },
        { $set: { strikes: 0, draftsPlayedSinceLastStrike: 0 } }
    );
}
// --- FIN DE LA MODIFICACIÓN ---
