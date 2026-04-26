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
        // ELO: Migración automática de campos ELO en equipos
        await migrateEloFields();
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

        // Prevención de duplicados en Draft Externo (Discord ID por Torneo)
        await db.collection('external_draft_registrations').createIndex(
            { tournamentId: 1, discordId: 1 }, 
            { unique: true }
        );

        // Índice TTL para pendingteams (auto-delete después de 15 minutos)
        // Accedemos a la BD 'test' donde VPG Bot guarda los pendingteams
        const testDb = client.db('test');
        await testDb.collection('pendingteams').createIndex(
            { createdAt: 1 },
            { expireAfterSeconds: 900 } // 15 minutos = 900 segundos
        );

        // Índices para Crawler VPG
        await db.collection('scanned_matches').createIndex({ matchId: 1 }, { unique: true });
        await db.collection('scanned_matches').createIndex({ "clubA.clubId": 1 });
        await db.collection('scanned_matches').createIndex({ "clubB.clubId": 1 });
        await db.collection('player_profiles').createIndex({ eaPlayerName: 1 }, { unique: true });
        await db.collection('club_profiles').createIndex({ eaClubId: 1 }, { unique: true });

        console.log('[DATABASE] Índices creados/verificados correctamente');
    } catch (error) {
        // Los errores de índices duplicados son normales y se ignoran
        if (error.code !== 11000 && error.code !== 85) {
            console.warn('[DATABASE] Advertencia al crear índices:', error.message);
        }
    }
}

/**
 * Migración idempotente: inyecta campos ELO en equipos que no los tengan.
 * Se ejecuta en cada arranque. Si el equipo ya tiene los campos, no hace nada.
 * @returns {Promise<number>} Número de equipos migrados
 */
export async function migrateEloFields() {
    try {
        const testDb = client.db('test');
        const teamsCol = testDb.collection('teams');

        // Solo actualizar equipos que NO tengan el campo 'elo'
        const result = await teamsCol.updateMany(
            { elo: { $exists: false } },
            {
                $set: {
                    elo: 1000,
                    eloHistory: [],
                    historicalStats: {
                        tournamentsPlayed: 0,
                        tournamentsWon: 0,
                        tournamentsRunnerUp: 0,
                        totalMatchesPlayed: 0,
                        totalWins: 0,
                        totalDraws: 0,
                        totalLosses: 0,
                        currentWinStreak: 0,
                        bestWinStreak: 0,
                        currentLossStreak: 0,
                        worstLossStreak: 0
                    }
                }
            }
        );

        // Crear índice para ranking por ELO
        await teamsCol.createIndex({ elo: -1 }).catch(() => {});

        if (result.modifiedCount > 0) {
            console.log(`[ELO MIGRATION] ${result.modifiedCount} equipos migrados con campos ELO iniciales (1000 pts).`);
        } else {
            console.log('[ELO MIGRATION] Todos los equipos ya tienen campos ELO. Sin cambios.');
        }

        // Migración de strikes para equipos
        const strikesResult = await teamsCol.updateMany(
            { strikes: { $exists: false } },
            { $set: { strikes: 0 } }
        );
        if (strikesResult.modifiedCount > 0) {
            console.log(`[STRIKES MIGRATION] ${strikesResult.modifiedCount} equipos migrados con campo strikes (0).`);
        }

        // Índice para team_pools
        const tournamentDb = client.db(process.env.DB_NAME || 'tournamentBotDb');
        await tournamentDb.collection('team_pools').createIndex({ shortId: 1 }, { unique: true }).catch(() => {});
        await tournamentDb.collection('team_pools').createIndex({ guildId: 1, status: 1 }).catch(() => {});

        return result.modifiedCount;
    } catch (error) {
        console.error('[ELO MIGRATION] Error durante la migración:', error.message);
        return 0;
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
    eaScannerEnabled: false, // Interruptor global para el recolector de EA Sports
    // --- INICIO DE LAS NUEVAS REGLAS ---
    draftMinQuotas: 'GK:1,DFC:2,CARR:2,MC:4,DC:2', // Mínimo para iniciar selección
    draftMaxQuotas: 'GK:1,DFC:2,CARR:2,MC:4,DC:2', // Máximo por equipo
    // --- FIN DE LAS NUEVAS REGLAS ---
    crawlerEnabled: true,
    crawlerDays: [1, 2, 3, 4], // 1=Lunes, 4=Jueves
    crawlerTimeRange: { start: '21:30', end: '00:30' } // Franja horaria Madrid. null = sin filtro
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

    // --- MIGRACIÓN AUTOMÁTICA DE MCD Y MV/MCO A MC ---
    let needsUpdate = false;
    const migrateQuotas = (quotaStr) => {
        if (!quotaStr || (!quotaStr.includes('MCD') && !quotaStr.includes('MV/MCO'))) return quotaStr;
        const parts = quotaStr.split(',');
        let mcTotal = 0;
        const newParts = [];
        for (const p of parts) {
            const [role, num] = p.split(':');
            if (role === 'MCD' || role === 'MV/MCO' || role === 'MC') {
                mcTotal += parseInt(num || 0);
            } else {
                newParts.push(p);
            }
        }
        if (mcTotal > 0) newParts.push(`MC:${mcTotal}`);
        needsUpdate = true;
        return newParts.join(',');
    };

    if (settings.draftMinQuotas) settings.draftMinQuotas = migrateQuotas(settings.draftMinQuotas);
    if (settings.draftMaxQuotas) settings.draftMaxQuotas = migrateQuotas(settings.draftMaxQuotas);

    if (needsUpdate) {
        await settingsCollection.updateOne({ _id: 'global_config' }, {
            $set: {
                draftMinQuotas: settings.draftMinQuotas,
                draftMaxQuotas: settings.draftMaxQuotas
            }
        });
        console.log('[DATABASE] Cuotas migradas automáticamente de MCD/MCO a MC global.');
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
