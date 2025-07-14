// database.js
const fs = require('fs');
const path = require('path');

// La ruta a nuestro archivo de base de datos JSON.
const dbPath = path.join(__dirname, 'db.json');

// Un estado inicial por defecto si el archivo no existe.
const defaultData = {
    torneoActivo: null,
    mensajeInscripcionId: null,
    listaEquiposMessageId: null,
};

/**
 * Guarda el estado actual en el archivo db.json.
 * @param {object} data El objeto completo con los datos del bot a guardar.
 */
function saveData(data) {
    try {
        // Convertimos el objeto de JavaScript a una cadena de texto JSON formateada
        const jsonString = JSON.stringify(data, null, 2);
        // Escribimos la cadena en el archivo de forma síncrona
        fs.writeFileSync(dbPath, jsonString, 'utf8');
        console.log('[DATABASE] Datos guardados correctamente en db.json');
    } catch (err) {
        console.error('[DATABASE] ERROR AL GUARDAR LOS DATOS:', err);
    }
}

/**
 * Carga el estado desde el archivo db.json.
 * Si el archivo no existe, devuelve el estado por defecto.
 * @returns {object} El objeto completo con los datos del bot.
 */
function loadData() {
    try {
        // Comprobamos si el archivo existe
        if (fs.existsSync(dbPath)) {
            // Leemos el contenido del archivo
            const jsonString = fs.readFileSync(dbPath, 'utf8');
            // Convertimos la cadena de texto JSON de vuelta a un objeto de JavaScript
            const data = JSON.parse(jsonString);
            console.log('[DATABASE] Datos cargados correctamente desde db.json');
            return data;
        } else {
            // Si el archivo no existe, creamos uno nuevo con los datos por defecto
            console.log('[DATABASE] No se encontró db.json. Creando uno nuevo con datos por defecto.');
            saveData(defaultData);
            return defaultData;
        }
    } catch (err) {
        console.error('[DATABASE] ERROR AL CARGAR LOS DATOS. USANDO DATOS POR DEFECTO:', err);
        // En caso de un error de lectura o parseo, devolvemos los datos por defecto para evitar un crash
        return defaultData;
    }
}

module.exports = { saveData, loadData };
