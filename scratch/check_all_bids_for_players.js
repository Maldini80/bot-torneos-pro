import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        eaPlayerName: { $in: ['sergio_rodeee', 'israeadri', 'elbrokoo30'] }
    }).toArray();
    
    console.log(`Bids for sergio_rodeee, israeadri, elbrokoo30:`);
    for (const b of bids) {
        console.log(`- Player: ${b.eaPlayerName.padEnd(15)} | Team: ${b.bidderTeamName.padEnd(20)} | Bid: ${b.bidAmount.toLocaleString().padStart(12)} € | Status: ${b.status} | Date: ${b.createdAt.toISOString()}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
