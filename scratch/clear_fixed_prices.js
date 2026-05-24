// scratch/clear_fixed_prices.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Clearing Fixed Prices in DB ---');
    const res = await db.collection('player_profiles').updateMany(
        { price: { $ne: undefined } },
        { $unset: { price: "" } }
    );
    
    console.log(`Successfully cleared fixed prices for ${res.modifiedCount} player documents.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
