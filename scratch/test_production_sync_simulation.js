// scratch/test_production_sync_simulation.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    // 1. Forzar la variable de entorno en memoria a 'true'
    process.env.USE_NEW_POINTS_LOGIC = 'true';
    console.log(`[SIMULADOR] Habilitando USE_NEW_POINTS_LOGIC = ${process.env.USE_NEW_POINTS_LOGIC}`);

    // 2. Conectar a la base de datos
    await connectDb();
    const realDb = getDb();

    // 3. Interceptar las funciones de escritura del objeto DB
    console.log('[SIMULADOR] Configurando interceptor de solo lectura para MongoDB...');
    const originalCollection = realDb.collection;
    
    realDb.collection = function(name) {
        const col = originalCollection.call(realDb, name);
        
        // Crear un proxy o wrapper sobre la colección
        const colWrapper = {
            // Métodos de lectura (se delegan al original de MongoDB de forma transparente)
            find: (...args) => col.find(...args),
            findOne: (...args) => col.findOne(...args),
            aggregate: (...args) => col.aggregate(...args),
            countDocuments: (...args) => col.countDocuments(...args),
            distinct: (...args) => col.distinct(...args),
            
            // Interceptores de escritura (no hacen nada en MongoDB, solo imprimen y simulan éxito)
            updateOne: async function(filter, update, options) {
                console.log(`\n🧡 [MOCK WRITE - updateOne] Colección: "${name}"`);
                console.log(`   Filtro: ${JSON.stringify(filter)}`);
                console.log(`   Update: ${JSON.stringify(update)}`);
                return { modifiedCount: 1, matchedCount: 1, acknowledged: true };
            },
            updateMany: async function(filter, update, options) {
                console.log(`\n🧡 [MOCK WRITE - updateMany] Colección: "${name}"`);
                console.log(`   Filtro: ${JSON.stringify(filter)}`);
                console.log(`   Update: ${JSON.stringify(update)}`);
                return { modifiedCount: 1, matchedCount: 1, acknowledged: true };
            },
            insertOne: async function(doc, options) {
                console.log(`\n🧡 [MOCK WRITE - insertOne] Colección: "${name}"`);
                console.log(`   Documento: ${JSON.stringify(doc)}`);
                return { insertedId: 'mocked-id', acknowledged: true };
            },
            insertMany: async function(docs, options) {
                console.log(`\n🧡 [MOCK WRITE - insertMany] Colección: "${name}"`);
                console.log(`   Documentos (${docs.length}): ${JSON.stringify(docs)}`);
                return { insertedCount: docs.length, acknowledged: true };
            },
            deleteOne: async function(filter, options) {
                console.log(`\n🧡 [MOCK WRITE - deleteOne] Colección: "${name}"`);
                console.log(`   Filtro: ${JSON.stringify(filter)}`);
                return { deletedCount: 1, acknowledged: true };
            },
            deleteMany: async function(filter, options) {
                console.log(`\n🧡 [MOCK WRITE - deleteMany] Colección: "${name}"`);
                console.log(`   Filtro: ${JSON.stringify(filter)}`);
                return { deletedCount: 1, acknowledged: true };
            }
        };

        // Enlazar los prototipos y propiedades adicionales
        Object.setPrototypeOf(colWrapper, col);
        return colWrapper;
    };

    console.log('[SIMULADOR] Interceptor listo. Importando syncFantasyWithVpg...');
    
    // 4. Importar dinámicamente el módulo de producción y ejecutar la sincronización
    const { syncFantasyWithVpg } = await import('../src/utils/fantasyVpgSync.js');
    
    console.log('[SIMULADOR] Iniciando simulación de sincronización real...');
    try {
        await syncFantasyWithVpg();
        console.log('\n[SIMULADOR] Simulación finalizada correctamente.');
    } catch (e) {
        console.error('Error durante la simulación de sincronización:', e);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
