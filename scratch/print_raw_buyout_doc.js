import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const buyout = await db.collection('fantasy_buyouts').findOne({}, { sort: { _id: -1 } });
    console.log('Latest raw buyout doc:', JSON.stringify(buyout, null, 2));
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
