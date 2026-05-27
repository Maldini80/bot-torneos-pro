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
        // NUEVO: Migración de precios manuales para la economía Fantasy
        await migrateManualPrices();
        // NUEVO: Asegurar que los horarios Fantasy por defecto estén inicializados
        await ensureDefaultSchedules();
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
        await db.collection('player_profiles').createIndex({ vpgLeagueSlug: 1 });
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
    crawlerDays: [0, 1, 2, 3, 4], // 0=Domingo, 1=Lunes, ..., 4=Jueves
    crawlerTimeRange: { start: '22:20', end: '01:00' } // Franja horaria Madrid. null = sin filtro
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

/**
 * Migra los precios manuales de los jugadores a la nueva escala de economía (x5.33333333, x2 para porteros, límites y redondeo a 50k).
 * Se ejecuta una sola vez.
 */
export async function migrateManualPrices() {
    try {
        if (!db) {
            console.warn('[DATABASE] No se pueden migrar precios manuales: DB no conectada');
            return;
        }
        const configCol = db.collection('fantasy_config');
        const flag = await configCol.findOne({ key: "manual_prices_scaled" });
        if (flag && flag.value === true) {
            console.log('[DATABASE] Precios manuales ya migrados anteriormente. Sin cambios.');
            return;
        }

        const playersCol = db.collection('player_profiles');
        const players = await playersCol.find({ manualPrice: { $exists: true, $ne: null } }).toArray();
        if (players.length > 0) {
            console.log(`[DATABASE] Migrando ${players.length} precios manuales a la nueva economía...`);
            for (const p of players) {
                const posUpper = (p.lastPosition || '').toUpperCase();
                const isGk = posUpper === 'POR' || posUpper === 'GK';
                let price = p.manualPrice * 5.33333333;
                if (isGk) {
                    price *= 2;
                }
                price = Math.min(80000000, Math.max(2600000, price));
                price = Math.round(price / 50000) * 50000;

                await playersCol.updateOne(
                    { _id: p._id },
                    { $set: { manualPrice: price } }
                );
            }
            console.log('[DATABASE] Migración de precios manuales finalizada.');
        }

        await configCol.updateOne(
            { key: "manual_prices_scaled" },
            { $set: { value: true } },
            { upsert: true }
        );
    } catch (error) {
        console.error('[DATABASE] Error en la migración de precios manuales:', error.message);
    }
}

/**
 * Asegura que exista el documento de horarios (schedules) en la base de datos con los valores por defecto.
 */
export async function ensureDefaultSchedules() {
    try {
        if (!db) {
            console.warn('[DATABASE] No se pueden inicializar horarios: DB no conectada');
            return;
        }
        const configCol = db.collection('fantasy_config');
        const existing = await configCol.findOne({ key: "schedules" });
        if (!existing) {
            console.log('[DATABASE] Inicializando horarios del Fantasy por defecto...');
            const defaultSchedules = {
                key: "schedules",
                market: {
                    active: true,
                    days: [0, 1, 2, 3, 4, 5, 6], // Todos los días
                    windows: ["18:00", "", ""], // Solo una por defecto
                    lastRun: ""
                },
                points: {
                    active: true,
                    days: [0, 1, 2, 3, 4, 5, 6], // Todos los días
                    time: "18:00",
                    lastRun: ""
                },
                lock: {
                    active: true,
                    days: [1, 2, 3, 4], // Lunes a Jueves
                    startTime: "21:30",
                    durationHours: 4
                }
            };
            await configCol.insertOne(defaultSchedules);
            console.log('[DATABASE] Horarios del Fantasy por defecto creados con éxito.');
        }
    } catch (e) {
        console.error('[DATABASE] Error al inicializar horarios por defecto:', e.message);
    }
}

