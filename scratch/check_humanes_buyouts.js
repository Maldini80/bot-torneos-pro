import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const buyouts = await db.collection('fantasy_buyouts').find({
        leagueId: league._id.toString(),
        $or: [
            { buyerDiscordId: '1115252996104790057' },
            { sellerDiscordId: '1115252996104790057' }
        ]
    }).toArray();
    
    console.log(`Buyouts for HUMANES FC (total: ${buyouts.length}):`);
    for (const b of buyouts) {
        console.log(`- Player: ${b.eaPlayerName.padEnd(15)} | Buyer: ${b.buyerDiscordId === '1115252996104790057' ? 'HUMANES' : b.buyerDiscordId} | Seller: ${b.sellerDiscordId === '1115252996104790057' ? 'HUMANES' : b.sellerDiscordId} | Date: ${b.timestamp}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
