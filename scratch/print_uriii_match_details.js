import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const matchIds = [
            "585050388830115",
            "587248686470407",
            "587440011740499",
            "594682884300140",
            "594902417240198",
            "594998191460330"
        ];
        
        console.log('--- DETALLES DE PARTIDOS ENCONTRADOS ---');
        for (const id of matchIds) {
            const m = await db.collection('scanned_matches').findOne({ matchId: id });
            if (m) {
                console.log(`\nMatch ID: ${m.matchId}`);
                console.log(`Club A: ${m.clubA?.name || 'ID ' + m.clubA?.clubId}`);
                console.log(`Club B: ${m.clubB?.name || 'ID ' + m.clubB?.clubId}`);
                
                // Buscar jugador en club A
                const clubAPlayer = Object.values(m.clubA?.players || {}).find(p => p.playername?.toLowerCase().includes('uriii-07-'));
                if (clubAPlayer) {
                    console.log(`  Encontrado en Club A (${m.clubA?.name}):`, JSON.stringify(clubAPlayer, null, 2));
                }

                // Buscar jugador en club B
                const clubBPlayer = Object.values(m.clubB?.players || {}).find(p => p.playername?.toLowerCase().includes('uriii-07-'));
                if (clubBPlayer) {
                    console.log(`  Encontrado en Club B (${m.clubB?.name}):`, JSON.stringify(clubBPlayer, null, 2));
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
