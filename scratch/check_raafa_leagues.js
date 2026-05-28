import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagues = await db.collection('fantasy_leagues').find({}).toArray();
        console.log(`=== LIGAS DONDE RAAFAGONZAA98 TIENE BASEPOINTS ===`);
        
        for (const l of leagues) {
            const basePoints = l.basePoints || {};
            // Check keys case-insensitively
            const foundKey = Object.keys(basePoints).find(k => k.toLowerCase() === 'raafagonzaa98');
            if (foundKey) {
                console.log(`- Liga: "${l.name}" (ID: ${l._id}) | Mode: ${l.pointsMode}`);
                console.log(`  * Key: "${foundKey}" -> BasePoints: ${basePoints[foundKey]}`);
            }
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
