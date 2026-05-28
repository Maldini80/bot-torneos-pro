import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const jamClubId = "29376";
        const startOfDay = Math.floor(new Date('2026-05-25T00:00:00Z').getTime() / 1000);
        const endOfDay = Math.floor(new Date('2026-05-26T23:59:59Z').getTime() / 1000); // Check yesterday and today
        
        console.log(`Searching scanned_matches for JAM ESPORTS (ClubID: ${jamClubId}) games played since May 25, 2026...`);
        const matches = await db.collection('scanned_matches').find({
            timestamp: { $gte: String(startOfDay), $lte: String(endOfDay) },
            [`clubs.${jamClubId}`]: { $exists: true }
        }).toArray();
        
        console.log(`Found ${matches.length} matches:`);
        for (const m of matches) {
            console.log(`Match ID: ${m.matchId} | Time: ${new Date(parseInt(m.timestamp)*1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
            console.log(` - Clubs:`, Object.values(m.clubs || {}).map(c => c.details?.name));
            if (m.players) {
                console.log(` - Players present:`);
                for (const cid in m.players) {
                    const pnames = Object.values(m.players[cid]).map(p => `${p.playername} (Rating: ${p.rating})`);
                    console.log(`    Club ${cid} (${m.clubs?.[cid]?.details?.name || cid}):\n      ${pnames.join('\n      ')}`);
                }
            }
            console.log('---------------------------------------------');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
