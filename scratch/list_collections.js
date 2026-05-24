// scratch/list_collections.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Database Collections & Counts ---');
    const collections = await db.listCollections().toArray();
    for (const coll of collections) {
        const count = await db.collection(coll.name).countDocuments({});
        console.log(`- ${coll.name}: ${count} documents`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
