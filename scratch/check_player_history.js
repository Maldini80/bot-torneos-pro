// scratch/check_player_history.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const leagueId = "6a11059081beb9b56df55c1b";
    
    console.log(`--- Checking Buyouts in League ${leagueId} ---`);
    const buyouts = await db.collection('fantasy_buyouts').find({ leagueId }).toArray();
    console.log(`Found ${buyouts.length} buyouts in this league:`);
    
    buyouts.forEach(b => {
        console.log(`- [${b.timestamp}] ${b.eaPlayerName}: Buyer ${b.buyerDiscordId} bought from Seller ${b.sellerDiscordId} for ${b.buyoutPrice}`);
    });

    console.log('\n--- Checking News Logs for Roster Changes ---');
    const news = await db.collection('fantasy_news').find({ 
        leagueId,
        type: { $in: ['buy', 'sell', 'bid', 'reward', 'buyout'] }
    }).toArray();
    
    console.log(`Found ${news.length} news logs:`);
    news.forEach(n => {
        console.log(`- [${n.timestamp}] ${n.content}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
