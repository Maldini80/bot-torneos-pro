import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const topo = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /topo/i
    });
    
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        bidderDiscordId: topo.discordId
    }).toArray();
    
    console.log(`Bids for TOPO HIJODEPUTA:`);
    for (const b of bids) {
        console.log(`- Player: ${b.eaPlayerName} | Bid: ${b.bidAmount.toLocaleString()} € | Status: ${b.status}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
