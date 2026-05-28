import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        
        // List databases
        const admin = client.db().admin();
        const dbs = await admin.listDatabases();
        console.log('Bases de datos disponibles:', dbs.databases.map(d => d.name));

        for (const dbInfo of dbs.databases) {
            const dbName = dbInfo.name;
            if (['admin', 'local', 'config'].includes(dbName)) continue;
            
            console.log(`\n================ DATABASE: ${dbName} ================`);
            const db = client.db(dbName);
            const collections = await db.listCollections().toArray();
            
            for (const col of collections) {
                const name = col.name;
                const count = await db.collection(name).countDocuments({
                    $or: [
                        { eaPlayerName: { $regex: 'ublaya', $options: 'i' } },
                        { username: { $regex: 'ublaya', $options: 'i' } },
                        { vpgUsername: { $regex: 'ublaya', $options: 'i' } },
                        { discordId: { $regex: 'ublaya', $options: 'i' } },
                        { name: { $regex: 'ublaya', $options: 'i' } }
                    ]
                });
                if (count > 0) {
                    console.log(`[ublaya] Colección: ${name} -> ${count} documentos coincidentes`);
                    const docs = await db.collection(name).find({
                        $or: [
                            { eaPlayerName: { $regex: 'ublaya', $options: 'i' } },
                            { username: { $regex: 'ublaya', $options: 'i' } },
                            { vpgUsername: { $regex: 'ublaya', $options: 'i' } },
                            { discordId: { $regex: 'ublaya', $options: 'i' } },
                            { name: { $regex: 'ublaya', $options: 'i' } }
                        ]
                    }).limit(3).toArray();
                    console.log(JSON.stringify(docs, null, 2));
                }
            }

            for (const col of collections) {
                const name = col.name;
                const count = await db.collection(name).countDocuments({
                    $or: [
                        { eaPlayerName: { $regex: 'Uriii', $options: 'i' } },
                        { username: { $regex: 'Uriii', $options: 'i' } },
                        { vpgUsername: { $regex: 'Uriii', $options: 'i' } },
                        { discordId: { $regex: 'Uriii', $options: 'i' } },
                        { name: { $regex: 'Uriii', $options: 'i' } }
                    ]
                });
                if (count > 0) {
                    console.log(`[Uriii] Colección: ${name} -> ${count} documentos coincidentes`);
                    const docs = await db.collection(name).find({
                        $or: [
                            { eaPlayerName: { $regex: 'Uriii', $options: 'i' } },
                            { username: { $regex: 'Uriii', $options: 'i' } },
                            { vpgUsername: { $regex: 'Uriii', $options: 'i' } },
                            { discordId: { $regex: 'Uriii', $options: 'i' } },
                            { name: { $regex: 'Uriii', $options: 'i' } }
                        ]
                    }).limit(3).toArray();
                    console.log(JSON.stringify(docs, null, 2));
                }
            }

            const scannedMatchesCol = collections.find(c => c.name === 'scanned_matches');
            if (scannedMatchesCol) {
                const bachaterosMatches = await db.collection('scanned_matches').find({
                    $or: [
                        { "clubA.name": { $regex: 'Bachateros', $options: 'i' } },
                        { "clubB.name": { $regex: 'Bachateros', $options: 'i' } }
                    ]
                }).toArray();
                console.log(`[Bachateros Matches] Colección: scanned_matches -> Encontrados ${bachaterosMatches.length} partidos`);
                for (const match of bachaterosMatches) {
                    console.log(`Match ID: ${match.matchId} | ${match.clubA?.name} vs ${match.clubB?.name} | Fecha: ${match.date || match.timestamp}`);
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
