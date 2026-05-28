import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    console.log('League Name:', league.name);
    console.log('initialBudget:', league.initialBudget);
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
