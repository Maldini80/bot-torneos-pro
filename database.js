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
 * Gets or creates a player's reputation profile.
 * @param {string} playerId - The player's Discord ID.
 * @param {string} psnId - The player's PSN ID.
 * @returns {Promise<object>} The player's reputation profile.
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
            isVetted: false
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
 * Adds a strike to a player and updates their history.
 * @param {string} targetPlayerId - The ID of the reported player.
 * @param {object} reporter - The captain object of the reporter.
 * @param {string} draftId - The ID of the draft where the report occurs.
 * @param {string} reason - The reason for the report.
 * @returns {Promise<boolean>} True if the player is now vetted.
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
        { returnDocument: 'after' }
    );

    const newStrikes = updateResult.value.strikes;
    const isNowVetted = newStrikes >= 2;

    if (updateResult.value.isVetted !== isNowVetted) {
        await reputationCollection.updateOne({ playerId: targetPlayerId }, { $set: { isVetted: isNowVetted } });
    }
    
    return isNowVetted;
}

/**
 * Updates the draft count for strike removal for all participants of a draft.
 * @param {string[]} playerIds - Array of IDs of all players who participated.
 */
export async function incrementDraftsPlayedForStrikeRemoval(playerIds) {
    if (!db) await connectDb();
    const reputationCollection = db.collection('playerReputation');

    await reputationCollection.updateMany(
        { playerId: { $in: playerIds }, strikes: 1 },
        { $inc: { draftsPlayedSinceLastStrike: 1 } }
    );
    
    await reputationCollection.updateMany(
        { strikes: 1, draftsPlayedSinceLastStrike: { $gte: 2 } },
        { $set: { strikes: 0, draftsPlayedSinceLastStrike: 0 } }
    );
}
// --- FIN DE LA MODIFICACIÓN ---
