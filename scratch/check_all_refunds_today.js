import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const today = new Date('2026-05-28T00:00:00.000Z');
    
    // Find all bids resolved today (status: rejected or accepted)
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        createdAt: { $gte: today }
    }).toArray();
    
    console.log(`Bids created/resolved today: ${bids.length}`);
    for (const b of bids) {
        console.log(`- Player: ${b.eaPlayerName.padEnd(15)} | Team: ${b.bidderTeamName.padEnd(20)} | Bid: ${b.bidAmount.toLocaleString().padStart(12)} € | Status: ${b.status} | Date: ${b.createdAt.toISOString()}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
