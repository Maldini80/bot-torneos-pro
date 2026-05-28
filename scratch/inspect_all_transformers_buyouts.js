import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const buyouts = await db.collection('fantasy_buyouts').find({
        leagueId: league._id.toString()
    }).toArray();
    
    console.log(`Buyouts in TRANSFORMERS CF:`);
    for (const b of buyouts) {
        console.log(`- Player: ${b.eaPlayerName.padEnd(15)} | Buyer: ${b.buyerDiscordId} | Seller: ${b.sellerDiscordId} | Date: ${b.timestamp}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
