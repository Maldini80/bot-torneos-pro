import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find league and team
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const team = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /humanes/i
    });
    
    console.log(`Team: ${team.teamName} (ID: ${team._id}), Owner: ${team.discordId}`);
    
    // Get all news, buyouts, and bids for this league/team
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        $or: [{ bidderDiscordId: team.discordId }, { sellerDiscordId: team.discordId }]
    }).toArray();
    
    const buyouts = await db.collection('fantasy_buyouts').find({
        leagueId: league._id.toString(),
        $or: [{ buyerTeamId: team._id.toString() }, { sellerTeamId: team._id.toString() }]
    }).toArray();
    
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString()
    }).toArray();
    
    // Let's print all bid actions (place, resolve, refund)
    console.log('\n--- BIDS DETAILS ---');
    bids.sort((a, b) => a.createdAt - b.createdAt);
    for (const b of bids) {
        console.log(`- ${b.createdAt.toISOString()} | Player: ${b.eaPlayerName} | Bid: ${b.bidAmount.toLocaleString()} € | Status: ${b.status} | Bidder: ${b.bidderDiscordId}`);
    }
    
    console.log('\n--- BUYOUTS DETAILS ---');
    buyouts.sort((a, b) => a.createdAt - b.createdAt);
    for (const bo of buyouts) {
        const isBuyer = bo.buyerTeamId === team._id.toString();
        console.log(`- ${bo.createdAt.toISOString()} | Player: ${bo.playerName} | Amount: ${bo.clauseAmount.toLocaleString()} € | Role: ${isBuyer ? 'Buyer' : 'Seller'}`);
    }
    
    console.log('\n--- NEWS DETAILS ---');
    news.sort((a, b) => a.createdAt - b.createdAt);
    for (const n of news) {
        if (JSON.stringify(n).toLowerCase().includes('humanes')) {
            console.log(`- ${n.createdAt.toISOString()} | [${n.type}] ${n.message}`);
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
