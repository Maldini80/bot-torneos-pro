// database.js - VERSIÓN FINAL EFICIENTE (CONEXIÓN ÚNICA)
const { MongoClient } = require('mongodb');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    throw new Error('DATABASE_URL no está definida en las variables de entorno.');
}

// CAMBIO CRÍTICO: Creamos una única instancia del cliente que se reutilizará.
const client = new MongoClient(dbUrl);
let db; // Variable para mantener la referencia a la base de datos.

// CAMBIO CRÍTICO: Función para conectar una sola vez al inicio.
async function connectDb() {
    try {
        await client.connect();
        db = client.db('tournamentBotDb'); // Nombre de tu base de datos
        console.log('[DATABASE] Conectado exitosamente a MongoDB Atlas.');
    } catch (err) {
        console.error('[DATABASE] ERROR FATAL AL CONECTAR CON MONGODB:', err);
        process.exit(1); // Si no podemos conectar a la DB, el bot no debe continuar.
    }
}

// Un estado inicial por defecto si no hay nada en la base de datos.
const defaultData = {
    _id: 'botState',
    torneoActivo: null,
    mensajeInscripcionId: null,
    listaEquiposMessageId: null,
};

/**
 * Guarda el estado actual en MongoDB. AHORA REUTILIZA LA CONEXIÓN.
 * @param {object} data El objeto de estado del bot a guardar.
 */
async function saveData(data) {
    try {
        const collection = db.collection('state');
        const dataToUpdate = { ...data };
        delete dataToUpdate._id;

        await collection.updateOne(
            { _id: 'botState' },
            { $set: dataToUpdate },
            { upsert: true }
        );
        // Quitamos el log de aquí para no llenar la consola.
    } catch (err) {
        console.error('[DATABASE] ERROR AL GUARDAR EN MONGODB:', err);
    }
}

/**
 * Carga el estado inicial desde MongoDB. AHORA REUTILIZA LA CONEXIÓN.
 * @returns {object} El objeto completo con los datos del bot.
 */
async function loadInitialData() {
    try {
        const collection = db.collection('state');
        let data = await collection.findOne({ _id: 'botState' });

        if (!data) {
            console.log('[DATABASE] No se encontró estado en MongoDB. Creando uno nuevo.');
            await collection.insertOne(defaultData);
            data = defaultData;
        }
        return data;
    } catch (err) {
        console.error('[DATABASE] ERROR AL CARGAR DESDE MONGODB. USANDO DATOS POR DEFECTO:', err);
        return defaultData;
    }
}

module.exports = { connectDb, saveData, loadInitialData };
