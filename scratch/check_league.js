import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId('6a0f8c20ae3aed564b3915a4') });
    console.log("League:", JSON.stringify(league, null, 2));
    
    process.exit(0);
}

main().catch(console.error);
