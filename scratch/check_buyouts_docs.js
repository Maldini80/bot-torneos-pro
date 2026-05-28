import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const buyouts = await db.collection('fantasy_buyouts').find({}).toArray();
    console.log(`Found ${buyouts.length} documents in fantasy_buyouts:`);
    for (const b of buyouts.slice(-10)) { // show the latest ones
        const dateStr = b.createdAt ? b.createdAt.toISOString() : 'N/A';
        console.log(`- Player: ${b.playerName} | Buyer: ${b.buyerTeamName} (${b.buyerTeamId}) | Seller: ${b.sellerTeamName} (${b.sellerTeamId}) | Amount: ${b.clauseAmount} | Date: ${dateStr}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
