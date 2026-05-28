import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const today = new Date('2026-05-28T00:00:00.000Z');
    
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        createdAt: { $gte: today }
    }).toArray();
    
    console.log(`Found ${bids.length} bids placed today in league ${league.name}:`);
    for (const b of bids) {
        console.log(`- Player: ${b.eaPlayerName} | Bidder: ${b.bidderTeamName} (${b.bidderDiscordId}) | Bid: ${b.bidAmount.toLocaleString()} € | Status: ${b.status} | Date: ${b.createdAt.toISOString()}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
