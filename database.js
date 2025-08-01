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
        db = client.db('tournamentBotDb'); // Se conecta a la base de datos correcta
        console.log('[DATABASE] Conectado exitosamente a MongoDB Atlas.');
        // NUEVO: Asegurarse de que la configuración global del bot exista al arrancar.
        await getBotSettings();
    } catch (err) { // Esta es la línea que corregimos para que tuviera las llaves.
        console.error('[DATABASE] ERROR FATAL AL CONECTAR CON MONGODB:', err);
        process.exit(1);
    }
}

export function getDb() {
    if (!db) {
        throw new Error('La base de datos no ha sido conectada todavía.');
    }
    return db; // Simplemente devuelve la conexión
}

// NUEVA SECCIÓN COMPLETA: Funciones para gestionar la configuración del bot.
const defaultBotSettings = {
    _id: 'global_config', // Usamos un ID fijo para tener siempre un único documento de configuración
    translationEnabled: true,
};

/**
 * Obtiene la configuración global del bot desde la base de datos.
 * Si no existe, la crea con los valores por defecto.
 * @returns {Promise<object>} El objeto de configuración del bot.
 */
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

/**
 * Actualiza la configuración global del bot.
 * @param {object} newSettings - Un objeto con los campos a actualizar.
 * @returns {Promise<import('mongodb').UpdateResult>} El resultado de la operación de actualización.
 */
export async function updateBotSettings(newSettings) {
    if (!db) await connectDb();
    const settingsCollection = db.collection('bot_settings');
    // Usamos $set para no sobreescribir todo el documento, solo los campos que cambiamos.
    return settingsCollection.updateOne({ _id: 'global_config' }, { $set: newSettings });
}
