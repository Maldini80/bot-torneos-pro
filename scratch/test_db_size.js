import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function checkDbSize() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error("DATABASE_URL no está configurada en el archivo .env");
        return;
    }

    const client = new MongoClient(url);
    try {
        await client.connect();
        console.log("Conectado con éxito a MongoDB Atlas");
        
        // Obtener la lista de todas las bases de datos en el clúster
        const adminDb = client.db('admin');
        const dbsInfo = await adminDb.command({ listDatabases: 1 });
        
        console.log("\n--- TAMAÑO DE BASES DE DATOS EN EL CLÚSTER ---");
        let totalClusterSize = 0;
        
        for (const dbInfo of dbsInfo.databases) {
            const sizeMB = dbInfo.sizeOnDisk / 1024 / 1024;
            totalClusterSize += dbInfo.sizeOnDisk;
            console.log(`- Base de datos: ${dbInfo.name}`);
            console.log(`  Tamaño en disco: ${sizeMB.toFixed(2)} MB`);
            
            // Analizar colecciones de esta base de datos si no es del sistema
            if (dbInfo.name !== 'admin' && dbInfo.name !== 'local' && dbInfo.name !== 'config') {
                const db = client.db(dbInfo.name);
                const collections = await db.listCollections().toArray();
                console.log(`  Colecciones (${collections.length}):`);
                for (const col of collections) {
                    try {
                        const colStats = await db.command({ collStats: col.name });
                        console.log(`    * ${col.name}: ${colStats.count} doc(s), ${(colStats.storageSize / 1024 / 1024).toFixed(2)} MB en disco`);
                    } catch (e) {
                        // Ignorar vistas u otras excepciones
                    }
                }
            }
        }
        
        console.log(`\nTamaño total del Clúster: ${(totalClusterSize / 1024 / 1024).toFixed(2)} MB / 512.00 MB`);
        
    } catch (err) {
        console.error("Error conectando o analizando base de datos:", err);
    } finally {
        await client.close();
    }
}

checkDbSize();
