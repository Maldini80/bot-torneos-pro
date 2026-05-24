import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    
    // List databases
    const dbs = await client.db().admin().listDatabases();
    console.log("Databases on cluster:");
    for (const dbInfo of dbs.databases) {
        console.log(`- ${dbInfo.name}`);
    }

    // Search for MonKeyDFFYLU in all databases
    for (const dbInfo of dbs.databases) {
        const db = client.db(dbInfo.name);
        const colls = await db.listCollections().toArray();
        const hasPlayers = colls.some(c => c.name === 'player_profiles');
        if (hasPlayers) {
            const player = await db.collection('player_profiles').findOne({ eaPlayerName: 'MonKeyDFFYLU' });
            if (player) {
                console.log(`Found MonKeyDFFYLU in DB "${dbInfo.name}":`);
                console.log(JSON.stringify(player, null, 2));
            }
        }
    }
    
    process.exit(0);
}

main().catch(console.error);
