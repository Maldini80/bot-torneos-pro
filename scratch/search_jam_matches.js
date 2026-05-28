import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        // Find matches of Jam eSports from yesterday (May 25, 2026)
        const startOfDay = Math.floor(new Date('2026-05-25T00:00:00Z').getTime() / 1000);
        const endOfDay = Math.floor(new Date('2026-05-25T23:59:59Z').getTime() / 1000);
        
        console.log(`Searching scanned_matches for JAM ESPORTS games played on May 25, 2026...`);
        const matches = await db.collection('scanned_matches').find({
            timestamp: { $gte: String(startOfDay), $lte: String(endOfDay) },
            $or: [
                { "clubA.details.name": { $regex: /jam/i } },
                { "clubB.details.name": { $regex: /jam/i } },
                { "clubs.863133": { $exists: true } } // JAM Club ID is 863133 (from team logo '8e63133e-...')
            ]
        }).toArray();
        
        console.log(`Found ${matches.length} matches:`);
        for (const m of matches) {
            console.log(`Match ID: ${m.matchId} | Time: ${new Date(parseInt(m.timestamp)*1000).toISOString()}`);
            console.log(` - Clubs:`, Object.values(m.clubs || {}).map(c => c.details?.name));
            if (m.players) {
                console.log(` - Players present:`);
                for (const cid in m.players) {
                    const pnames = Object.values(m.players[cid]).map(p => p.playername);
                    console.log(`    Club ${cid}: ${pnames.join(', ')}`);
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
