// scratch/check_active_leagues.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
    console.log(`Active leagues in fantasy_config:`, config ? config.slugs : 'None found');

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
