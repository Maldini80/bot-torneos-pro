// scratch/test_production_sync_simulation.js
import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

// Caché en memoria para simular las lecturas de los perfiles actualizados
const playerCache = new Map();

async function main() {
    // 1. Forzar la variable de entorno en memoria a 'true'
    process.env.USE_NEW_POINTS_LOGIC = 'true';
    console.log(`[SIMULADOR] Habilitando USE_NEW_POINTS_LOGIC = ${process.env.USE_NEW_POINTS_LOGIC}`);

    // 2. Conectar a la base de datos
    await connectDb();
    const realDb = getDb();

    // 3. Interceptar las funciones de escritura y lectura del objeto DB
    console.log('[SIMULADOR] Configurando interceptor con caché en memoria de solo lectura...');
    const originalCollection = realDb.collection;
    
    realDb.collection = function(name) {
        const col = originalCollection.call(realDb, name);
        
        // Crear un proxy o wrapper sobre la colección
        const colWrapper = {
            // Métodos de lectura
            find: (...args) => col.find(...args),
            aggregate: (...args) => col.aggregate(...args),
            countDocuments: (...args) => col.countDocuments(...args),
            distinct: (...args) => col.distinct(...args),
            
            findOne: async function(filter, ...args) {
                // Si es la colección de perfiles de jugador y tenemos el documento en el caché,
                // devolvemos el documento actualizado en memoria para que se calcule el delta real.
                if (name === 'player_profiles') {
                    if (filter._id && playerCache.has(filter._id.toString())) {
                        return playerCache.get(filter._id.toString());
                    }
                    if (filter.eaPlayerName) {
                        let matcher = () => false;
                        if (typeof filter.eaPlayerName === 'string') {
                            const q = filter.eaPlayerName.toLowerCase();
                            matcher = (n) => n.toLowerCase() === q;
                        } else if (filter.eaPlayerName instanceof RegExp) {
                            matcher = (n) => filter.eaPlayerName.test(n);
                        } else if (filter.eaPlayerName.$regex) {
                            const regexObj = filter.eaPlayerName.$regex instanceof RegExp 
                                ? filter.eaPlayerName.$regex 
                                : new RegExp(filter.eaPlayerName.$regex, 'i');
                            matcher = (n) => regexObj.test(n);
                        }
                        
                        for (const cachedDoc of playerCache.values()) {
                            if (cachedDoc.eaPlayerName && matcher(cachedDoc.eaPlayerName)) {
                                return cachedDoc;
                            }
                        }
                    }
                }
                return col.findOne(filter, ...args);
            },
            
            // Interceptores de escritura (no hacen nada en MongoDB, guardan en caché si aplica, y loguean)
            updateOne: async function(filter, update, options) {
                console.log(`\n🧡 [MOCK WRITE - updateOne] Colección: "${name}"`);
                console.log(`   Filtro: ${JSON.stringify(filter)}`);
                console.log(`   Update: ${JSON.stringify(update)}`);
                
                if (name === 'player_profiles' && filter._id) {
                    const idStr = filter._id.toString();
                    let doc = playerCache.get(idStr);
                    if (!doc) {
                        doc = await col.findOne({ _id: filter._id });
                    }
                    if (doc && update.$set) {
                        // Clonar objeto y aplicar cambios en memoria
                        const updatedDoc = JSON.parse(JSON.stringify(doc));
                        Object.assign(updatedDoc, update.$set);
                        if (update.$set.stats) {
                            updatedDoc.stats = Object.assign({}, doc.stats, update.$set.stats);
                        }
                        playerCache.set(idStr, updatedDoc);
                    }
                }
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
                
                if (name === 'player_profiles') {
                    const idStr = doc._id ? doc._id.toString() : new ObjectId().toString();
                    const newDoc = { _id: idStr, ...doc };
                    playerCache.set(idStr, newDoc);
                }
                return { insertedId: 'mocked-id', acknowledged: true };
            },
            
            insertMany: async function(docs, options) {
                console.log(`\n🧡 [MOCK WRITE - insertMany] Colección: "${name}"`);
                console.log(`   Documentos (${docs.length}): ${JSON.stringify(docs)}`);
                
                if (name === 'player_profiles') {
                    for (const doc of docs) {
                        const idStr = doc._id ? doc._id.toString() : new ObjectId().toString();
                        const newDoc = { _id: idStr, ...doc };
                        playerCache.set(idStr, newDoc);
                    }
                }
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
