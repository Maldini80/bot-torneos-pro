// scratch/update_thunder_club.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    
    console.log('\n--- Updating Thunder Gaming to use Black Hawks (8701) ---');
    
    const res = await db.collection('teams').updateOne(
        { name: "Thunder Gaming" },
        { 
            $set: { 
                eaClubId: "8701",
                eaClubName: "Black Hawks"
            } 
        }
    );
    
    console.log(`Updated teams: ${res.modifiedCount}`);
    
    const updated = await db.collection('teams').findOne({ name: "Thunder Gaming" });
    console.log(JSON.stringify(updated, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
