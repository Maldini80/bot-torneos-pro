import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const team = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /alvaro/i
    });
    
    if (!team) {
        console.log('Team not found');
        process.exit(1);
    }
    
    console.log(`Team: ${team.teamName} (ID: ${team._id}), Owner: ${team.discordId}`);
    console.log(`Balance: ${team.balance.toLocaleString()} €`);
    
    const bids = await db.collection('fantasy_market_bids').find({
        leagueId: league._id.toString(),
        bidderDiscordId: team.discordId
    }).toArray();
    
    console.log('\nBids:');
    for (const b of bids) {
        console.log(`- Player: ${b.eaPlayerName} | Bid: ${b.bidAmount.toLocaleString()} € | Status: ${b.status} | Date: ${b.createdAt.toISOString()}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
