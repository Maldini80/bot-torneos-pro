// database.js - VERSIÓN FINAL CON MONGODB ATLAS
const { MongoClient } = require('mongodb');

// Obtenemos la "llave" de la base de datos desde las variables de entorno de Render.
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    throw new Error('DATABASE_URL no está definida en las variables de entorno.');
}

const client = new MongoClient(dbUrl);

// Un estado inicial por defecto si no hay nada en la base de datos.
const defaultData = {
    _id: 'botState', // Un identificador fijo para nuestro documento de estado.
    torneoActivo: null,
    mensajeInscripcionId: null,
    listaEquiposMessageId: null,
};

/**
 * Guarda el estado actual en la base de datos de MongoDB.
 * @param {object} data El objeto de estado del bot a guardar.
 */
async function saveData(data) {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const collection = db.collection('state');
        
        // Preparamos los datos para que no incluyan el _id en la actualización
        const dataToUpdate = { ...data };
        delete dataToUpdate._id;

        // Usamos updateOne con upsert:true. Esto actualizará el documento si existe, o lo creará si no.
        await collection.updateOne(
            { _id: 'botState' },
            { $set: dataToUpdate },
            { upsert: true }
        );
        console.log('[DATABASE] Datos guardados correctamente en MongoDB Atlas.');
    } catch (err) {
        console.error('[DATABASE] ERROR AL GUARDAR EN MONGODB:', err);
    } finally {
        await client.close();
    }
}

/**
 * Carga el estado desde la base de datos de MongoDB.
 * @returns {object} El objeto completo con los datos del bot.
 */
async function loadData() {
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const collection = db.collection('state');
        let data = await collection.findOne({ _id: 'botState' });

        if (!data) {
            console.log('[DATABASE] No se encontró estado en MongoDB. Creando uno nuevo.');
            await collection.insertOne(defaultData);
            data = defaultData;
        }
        console.log('[DATABASE] Datos cargados correctamente desde MongoDB Atlas.');
        return data;
    } catch (err) {
        console.error('[DATABASE] ERROR AL CARGAR DESDE MONGODB. USANDO DATOS POR DEFECTO:', err);
        return defaultData;
    } finally {
        await client.close();
    }
}

// CAMBIO IMPORTANTE: Ahora loadData es asíncrona.
// Necesitamos una función para inicializar el bot.
async function initializeData() {
    return await loadData();
}

module.exports = { saveData, initializeData };
