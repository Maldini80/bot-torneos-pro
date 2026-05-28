import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const jamClubId = "29376";
        
        console.log(`Searching scanned_matches for all JAM ESPORTS (ClubID: ${jamClubId}) games...`);
        const matches = await db.collection('scanned_matches').find({
            [`clubs.${jamClubId}`]: { $exists: true }
        }).sort({ timestamp: -1 }).limit(5).toArray();
        
        console.log(`Found ${matches.length} matches:`);
        for (const m of matches) {
            console.log(`Match ID: ${m.matchId} | Time: ${new Date(parseInt(m.timestamp)*1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
            console.log(` - Clubs:`, Object.values(m.clubs || {}).map(c => c.details?.name));
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
