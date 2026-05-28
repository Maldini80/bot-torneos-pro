import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const jamClubId = "29376";
        
        console.log(`Checking player lists for recent JAM Esports matches...`);
        const matches = await db.collection('scanned_matches').find({
            [`clubs.${jamClubId}`]: { $exists: true }
        }).sort({ timestamp: -1 }).limit(5).toArray();
        
        for (const m of matches) {
            console.log(`\nMatch ID: ${m.matchId} | Time: ${new Date(parseInt(m.timestamp)*1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
            
            const jamPlayers = m.players?.[jamClubId] || {};
            const names = Object.values(jamPlayers).map(p => `${p.playername} (Rating: ${p.rating}, Pos: ${p.pos})`);
            console.log(`Players in JAM eSports:`);
            names.forEach(n => console.log(` - ${n}`));
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
