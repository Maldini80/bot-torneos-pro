import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const dbs = ['test', 'tournamentBotDb'];
        for (const dbName of dbs) {
            const db = client.db(dbName);
            console.log(`Checking DB: ${dbName}`);
            
            // Search by username pattern
            const userByName = await db.collection('verified_users').findOne({
                $or: [
                    { discordUsername: /nau/i },
                    { username: /nau/i },
                    { psnId: /nau/i },
                    { gameId: /nau/i }
                ]
            });
            console.log('User found by pattern "nau":', userByName);

            // Search by Discord ID
            const userById = await db.collection('verified_users').findOne({
                discordId: '435171084577538059'
            });
            console.log('User found by Discord ID "435171084577538059":', userById);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
