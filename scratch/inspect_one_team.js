// scratch/inspect_one_team.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    
    const team = await db.collection('teams').findOne({ eaClubId: { $ne: null } });
    console.log(JSON.stringify(team, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
