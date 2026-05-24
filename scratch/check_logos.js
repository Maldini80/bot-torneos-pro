import { connectDb, getDb } from './database.js';
import 'dotenv/config';

async function run() {
    await connectDb();
    const db = getDb();
    const teams = await db.collection('teams').find({}, { projection: { name: 1, logoUrl: 1 } }).toArray();
    console.log('Total teams:', teams.length);
    console.log('Sample teams:', teams.slice(0, 10));
    
    // Check black hawks/thunder gaming specifically
    const thunder = teams.find(t => t.name.toLowerCase().includes('thunder') || t.name.toLowerCase().includes('black hawks'));
    console.log('Thunder Gaming / Black Hawks:', thunder);
    
    process.exit(0);
}

run().catch(console.error);
