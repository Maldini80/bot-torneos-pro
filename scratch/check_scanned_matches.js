import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    console.log('=== INVESTIGANDO LA COLECCIÓN scanned_matches ===\n');

    const total = await db.collection('scanned_matches').countDocuments();
    console.log(`Total de partidos escaneados: ${total}`);

    if (total > 0) {
        const match = await db.collection('scanned_matches').findOne();
        console.log('\nEjemplo de partido escaneado:');
        console.log(JSON.stringify(match, null, 2));
    }

    await client.close();
}

main().catch(console.error);
