import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL || process.env.MONGODB_URI);
    await client.connect();
    
    // Check tournamentBotDb database
    const db = client.db('tournamentBotDb');
    console.log("=== Collections in tournamentBotDb ===");
    const collections = await db.listCollections().toArray();
    for (const c of collections) {
        const count = await db.collection(c.name).countDocuments();
        console.log(`- ${c.name} | Documents: ${count}`);
    }

    // Check test database
    const testDb = client.db('test');
    console.log("\n=== Collections in test ===");
    const testCollections = await testDb.listCollections().toArray();
    for (const c of testCollections) {
        const count = await testDb.collection(c.name).countDocuments();
        console.log(`- ${c.name} | Documents: ${count}`);
    }
    
    await client.close();
}

run().catch(console.error);
