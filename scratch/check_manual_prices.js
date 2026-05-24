import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');
    const players = await db.collection('player_profiles').find({ manualPrice: { $exists: true, $ne: null } }).toArray();
    console.log(`Found ${players.length} players with manual price:`);
    for (const p of players) {
        console.log(`- ${p.eaPlayerName}: position=${p.lastPosition}, manualPrice=${p.manualPrice}`);
    }
    await client.close();
}

main().catch(console.error);
