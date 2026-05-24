import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const testDb = client.db('test');
        const collections = await testDb.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        console.log('Collections in test DB:', collectionNames);
        
        const discordId = "1264218593793413182";
        
        for (const colName of collectionNames) {
            try {
                const results = await testDb.collection(colName).find({
                    $or: [
                        { discordId: discordId },
                        { discordID: discordId },
                        { userId: discordId },
                        { captainId: discordId },
                        { capitanId: discordId },
                        { ownerId: discordId },
                        { gameId: /satiiita/i },
                        { psnId: /satiiita/i },
                        { gameId: /SweetYanira/i },
                        { psnId: /SweetYanira/i }
                    ]
                }).toArray();
                if (results.length > 0) {
                    console.log(`\n--- Found in test DB collection: ${colName} ---`);
                    console.log(JSON.stringify(results, null, 2));
                }
            } catch (err) {
                // Ignore collection errors
            }
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
