import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    
    // Find Banano Esports
    const team = await db.collection('teams').findOne({ name: /banano/i });
    console.log("Banano Esports document:", JSON.stringify(team, null, 2));
    
    await client.close();
}
main().catch(console.error);
