import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const mongoUri = process.env.DATABASE_URL;
    const client = new MongoClient(mongoUri);
    try {
        await client.connect();
        const db = client.db('test');
        
        const queries = [
            { psnId: { $regex: /acharaf/i } },
            { eaPlayerName: { $regex: /acharaf/i } },
            { name: { $regex: /acharaf/i } },
            { username: { $regex: /acharaf/i } },
            { username: { $regex: /acharf/i } },
            { username: { $regex: /alavarovich/i } },
            { psnId: { $regex: /alavarovich/i } }
        ];
        
        for (const q of queries) {
            console.log(`\nQuery: ${JSON.stringify(q)}`);
            const results = await db.collection('vpg_users').find(q).toArray();
            for (const r of results) {
                console.log(r);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
