import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- BUSCANDO "Uriii-07-" EN STRINGS DE TODOS LOS PARTIDOS ESCANEADOS ---');
        const matches = await db.collection('scanned_matches').find({}).toArray();
        let foundCount = 0;
        for (const m of matches) {
            const mStr = JSON.stringify(m).toLowerCase();
            if (mStr.includes('uriii-07-') || mStr.includes('uriii_07')) {
                console.log(`\nCoincidencia en Partido ID: ${m.matchId}`);
                console.log(`Fecha: ${m.date || m.matchDate} | ${m.clubA?.name} vs ${m.clubB?.name}`);
                foundCount++;
                if (foundCount > 5) break;
            }
        }
        console.log(`\nPartidos encontrados: ${foundCount}`);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
