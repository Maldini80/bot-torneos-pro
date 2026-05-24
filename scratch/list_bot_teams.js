// scratch/list_bot_teams.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Bot Teams in Database ---');
    const teams = await db.collection('teams').find({}).toArray();
    console.log(`Total teams: ${teams.length}`);
    
    teams.forEach(t => {
        console.log(`- Team: "${t.name}" | EA Club ID: ${t.eaClubId || '❌ NOT LINKED'} | Platform: ${t.eaPlatform || 'N/A'}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
