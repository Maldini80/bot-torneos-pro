import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const countAll = await db.collection('player_profiles').countDocuments({
            vpgLeagueSlug: { $exists: true, $ne: null }
        });
        const countCached = await db.collection('player_profiles').countDocuments({
            vpgLeagueSlug: { $exists: true, $ne: null },
            vpgProfile: { $exists: true, $ne: null }
        });

        console.log(`Total VPG players in DB: ${countAll}`);
        console.log(`VPG players with cached profile: ${countCached}`);
        console.log(`VPG players needing profile fetch: ${countAll - countCached}`);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
