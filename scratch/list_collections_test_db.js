// scratch/list_collections_test_db.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    
    // Connect to 'test' database
    const db = client.db('test');
    
    console.log('\n--- "test" Database Collections & Counts ---');
    const collections = await db.listCollections().toArray();
    for (const coll of collections) {
        const count = await db.collection(coll.name).countDocuments({});
        console.log(`- ${coll.name}: ${count} documents`);
    }

    // Let's print teams from the 'test' database
    const teams = await db.collection('teams').find({}).toArray();
    console.log(`\nTotal teams in "test" DB: ${teams.length}`);
    teams.forEach(t => {
        console.log(`- Team: "${t.name}" | EA Club ID: ${t.eaClubId} | managerId: ${t.managerId}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
