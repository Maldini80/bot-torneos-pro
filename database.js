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
        // IMPORTANTE: Mantenemos 'tournamentBotDb' como la base de datos por defecto para torneos.
        db = client.db('tournamentBotDb'); // IMPORTANTE: Mantenemos esta como default para torneos
        console.log('[DATABASE] Conectado exitosamente a MongoDB Atlas (Default: tournamentBotDb).');
        // NUEVO: Asegurarse de que la configuración global del bot exista al arrancar.
        await getBotSettings();
        // NUEVO: Crear índices para optimizar queries del dashboard
        await ensureIndexes();
    } catch (err) { // --- CORRECCIÓN CRÍTICA --- Se añadieron las llaves {}
        console.error('[DATABASE] ERROR FATAL AL CONECTAR CON MONGODB:', err);
        process.exit(1);
    }
}

/**
 * Crea índices en MongoDB para optimizar las consultas del dashboard
 * Esta función es idempotente - si los índices ya existen, no hace nada
 */
export async function ensureIndexes() {
    try {
        if (!db) {
            console.warn('[DATABASE] No se pueden crear índices: DB no conectada');
            return;
        }

        // Índices para torneos
        await db.collection('tournaments').createIndex({ status: 1, createdAt: -1 });
        await db.collection('tournaments').createIndex({ shortId: 1 }, { unique: true });
        await db.collection('tournaments').createIndex({ name: 'text' }); // Para búsqueda

        // Índices para drafts
        await db.collection('drafts').createIndex({ status: 1, createdAt: -1 });
        await db.collection('drafts').createIndex({ shortId: 1 }, { unique: true });
        await db.collection('drafts').createIndex({ draftName: 'text' }); // Para búsqueda

        // Índice TTL para pendingteams (auto-delete después de 15 minutos)
        // Accedemos a la BD 'test' donde VPG Bot guarda los pendingteams
        const testDb = client.db('test');
        await testDb.collection('pendingteams').createIndex(
            { createdAt: 1 },
            { expireAfterSeconds: 900 } // 15 minutos = 900 segundos
        );

        console.log('[DATABASE] Índices creados/verificados correctamente');
    } catch (error) {
        // Los errores de índices duplicados son normales y se ignoran
        if (error.code !== 11000 && error.code !== 85) {
            console.warn('[DATABASE] Advertencia al crear índices:', error.message);
        }
    }
}

// FIX: Permitir acceder a otras bases de datos (ej: 'test' para equipos)
export function getDb(dbName) {
    if (dbName) {
        if (!client) throw new Error('Cliente MongoDB no conectado.');
        return client.db(dbName);
    }

    if (!db) {
        throw new Error('La base de datos por defecto no ha sido conectada todavía.');
    }
    return db; // Simplemente devuelve la conexión por defecto
}

// NUEVA SECCIÓN COMPLETA: Funciones para gestionar la configuración del bot.
const defaultBotSettings = {
    _id: 'global_config', // Usamos un ID fijo para tener siempre un único documento de configuración
    translationEnabled: true,
    twitterEnabled: true,
    // --- INICIO DE LAS NUEVAS REGLAS ---
    draftMinQuotas: 'GK:1,DFC:2,CARR:2,MC:4,DC:2', // Mínimo para iniciar selección
    draftMaxQuotas: 'GK:1,DFC:2,CARR:2,MC:4,DC:2'  // Máximo por equipo
    // --- FIN DE LAS NUEVAS REGLAS ---
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
