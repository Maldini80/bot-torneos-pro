import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');

    console.log('Buscando clausulazos pendientes...');
    const pendingCount = await db.collection('fantasy_buyouts').countDocuments({ processed: false });
    console.log(`Encontrados ${pendingCount} clausulazos pendientes.`);

    if (pendingCount > 0) {
        const result = await db.collection('fantasy_buyouts').updateMany(
            { processed: false },
            { $set: { processed: true, processedAt: new Date() } }
        );
        console.log(`Actualizados ${result.modifiedCount} clausulazos a processed: true.`);
    } else {
        console.log('No hay clausulazos pendientes.');
    }

    await client.close();
}
main().catch(console.error);
