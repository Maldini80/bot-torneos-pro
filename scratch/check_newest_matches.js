import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('Querying the 5 newest matches from scanned_matches...');
        const matches = await db.collection('scanned_matches').find({}).sort({ timestamp: -1 }).limit(5).toArray();
        
        for (const m of matches) {
            console.log(`Match ID: ${m.matchId}`);
            console.log(`Timestamp: ${m.timestamp} (${new Date(parseInt(m.timestamp)*1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })})`);
            console.log(`Clubs:`);
            for (const cid in m.clubs) {
                console.log(`  - Club ID ${cid}: "${m.clubs[cid]?.details?.name}" / "${m.clubs[cid]?.name}"`);
            }
            if (m.players) {
                console.log(`Players:`);
                for (const cid in m.players) {
                    const pnames = Object.values(m.players[cid]).map(p => p.playername);
                    console.log(`  Club ${cid}: ${pnames.join(', ')}`);
                }
            }
            console.log('----------------------------------------------------');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
