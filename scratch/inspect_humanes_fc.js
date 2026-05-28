import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find league
    const league = await db.collection('fantasy_leagues').findOne({
        name: { $regex: /transformers/i }
    });
    if (!league) {
        console.log('League TRANSFORMERS CF not found');
        process.exit(1);
    }
    console.log(`Found League: "${league.name}" (ID: ${league._id})`);
    
    // Find team
    const team = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: { $regex: /humanes/i }
    });
    if (!team) {
        console.log('Team HUMANES FC not found');
        process.exit(1);
    }
    console.log(`Found Team: "${team.teamName}" (ID: ${team._id}), Owner Discord: ${team.discordId}`);
    console.log(`Current Balance: ${team.balance.toLocaleString('es-ES')} €`);
    console.log(`Current Points: ${team.points}`);
    console.log(`Roster:`, team.players);
    
    // Find bids by this team today
    console.log('\n--- Bids from today (2026-05-28) ---');
    const today = new Date('2026-05-28T00:00:00.000Z');
    const bids = await db.collection('fantasy_market_bids').find({
        $or: [
            { bidderDiscordId: team.discordId },
            { sellerDiscordId: team.discordId }
        ],
        leagueId: league._id.toString()
    }).toArray();
    
    for (const b of bids) {
        console.log(`- Player: ${b.eaPlayerName} | BidAmount: ${(b.bidAmount || 0).toLocaleString('es-ES')} € | Status: ${b.status} | Bidder: ${b.bidderDiscordId} | Seller: ${b.sellerDiscordId} | Date: ${b.createdAt.toISOString()}`);
    }
    
    // Find news related to this team today
    console.log('\n--- News related to this team today ---');
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString(),
        createdAt: { $gte: today }
    }).toArray();
    
    const teamNews = news.filter(n => JSON.stringify(n).toLowerCase().includes('humanes'));
    for (const n of teamNews) {
        console.log(`- [${n.type}] ${n.message} (Date: ${n.createdAt.toISOString()})`);
    }
    
    // Check if there are any buyouts (clausulazos) today involving this team
    console.log('\n--- Buyouts today involving this team ---');
    const buyouts = await db.collection('fantasy_buyouts').find({
        leagueId: league._id.toString(),
        createdAt: { $gte: today }
    }).toArray();
    for (const bo of buyouts) {
        if (bo.buyerTeamId === team._id.toString() || bo.sellerTeamId === team._id.toString()) {
            console.log(`- Buyout: ${bo.playerName} | Price: ${bo.clauseAmount.toLocaleString('es-ES')} € | Buyer: ${bo.buyerTeamId} | Seller: ${bo.sellerTeamId} | Date: ${bo.createdAt.toISOString()}`);
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
