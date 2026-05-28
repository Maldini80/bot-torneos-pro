import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        
        const dbs = ['tournamentBotDb', 'test'];
        for (const dbName of dbs) {
            const db = client.db(dbName);
            console.log(`\n================ DATABASE: ${dbName} ================`);
            const collections = await db.listCollections().toArray();
            for (const colInfo of collections) {
                const colName = colInfo.name;
                // Buscar coincidencia en cualquier campo (haremos una consulta simple)
                const query = {
                    $or: [
                        { eaPlayerName: { $regex: 'ublaya', $options: 'i' } },
                        { eaPlayerName: { $regex: 'uriii-07-', $options: 'i' } },
                        { discordId: { $regex: 'ublaya', $options: 'i' } },
                        { username: { $regex: 'ublaya', $options: 'i' } },
                        { username: { $regex: 'uriii-07-', $options: 'i' } },
                        { vpgUsername: { $regex: 'ublaya', $options: 'i' } },
                        { vpgUsername: { $regex: 'uriii-07-', $options: 'i' } },
                        { name: { $regex: 'ublaya', $options: 'i' } },
                        { name: { $regex: 'uriii-07-', $options: 'i' } }
                    ]
                };

                try {
                    const count = await db.collection(colName).countDocuments(query);
                    if (count > 0) {
                        const docs = await db.collection(colName).find(query).limit(5).toArray();
                        console.log(`Colección "${colName}": Encontrados ${count} documentos.`);
                        console.log(JSON.stringify(docs, null, 2));
                    }
                } catch (e) {
                    // Algunos esquemas o índices raros pueden dar error en la búsqueda
                }
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
