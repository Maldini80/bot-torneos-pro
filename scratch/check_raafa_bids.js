import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "raafagonzaa98";
        
        // Check news/transactions for raafagonzaa98
        const news = await db.collection('fantasy_news').find({
            $or: [
                { message: { $regex: new RegExp(playerName, 'i') } },
                { "metadata.eaPlayerName": { $regex: new RegExp('^' + playerName + '$', 'i') } }
            ]
        }).toArray();
        
        console.log(`=== Transactions in fantasy_news for ${playerName} ===`);
        console.log(`Found: ${news.length}`);
        news.forEach(n => {
            console.log(`- Date: ${n.createdAt || n.timestamp} | Msg: ${n.message}`);
        });
        
        // Check market bids
        const bids = await db.collection('fantasy_market_bids').find({
            eaPlayerName: { $regex: new RegExp('^' + playerName + '$', 'i') }
        }).toArray();
        
        console.log(`\n=== Market Bids for ${playerName} ===`);
        console.log(`Found: ${bids.length}`);
        bids.forEach(b => {
            console.log(`- Date: ${b.createdAt || b.timestamp} | Bidder: ${b.bidderDiscordId} | League: ${b.leagueId} | Amount: ${b.bidAmount} | Status: ${b.status}`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
