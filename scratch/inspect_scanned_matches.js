import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- BUSCANDO UN PARTIDO CUALQUIERA PARA VER LA ESTRUCTURA ---');
        const match = await db.collection('scanned_matches').findOne();
        console.log(JSON.stringify(match, null, 2));

        console.log('\n--- BUSCANDO TODOS LOS PARTIDOS ESCANEADOS ---');
        const allMatches = await db.collection('scanned_matches').find({}).limit(5).toArray();
        console.log(`Estructuras de los partidos:`);
        for (const m of allMatches) {
            console.log(`Match ID: ${m.matchId} | Club A: ${m.clubA?.name || m.clubA?.clubId} | Club B: ${m.clubB?.name || m.clubB?.clubId}`);
            if (m.clubA && m.clubA.players) {
                console.log('  Club A players keys:', Object.keys(m.clubA.players[0] || {}));
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
