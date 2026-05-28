import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "zzRaydenzz";
        const playerLower = playerName.toLowerCase();
        
        console.log(`--- Checking fantasy_buyouts for ${playerName} ---`);
        const buyouts = await db.collection('fantasy_buyouts').find({
            eaPlayerName: { $regex: new RegExp('^' + playerName + '$', 'i') }
        }).toArray();
        buyouts.forEach(b => {
            console.log(`Buyout in League ${b.leagueId}: Buyer ${b.buyerDiscordId}, Seller ${b.sellerDiscordId}, Date: ${b.timestamp}`);
        });
        
        console.log(`\n--- Checking fantasy_market_bids for ${playerName} ---`);
        const bids = await db.collection('fantasy_market_bids').find({
            eaPlayerName: { $regex: new RegExp('^' + playerName + '$', 'i') },
            status: 'accepted'
        }).toArray();
        bids.forEach(b => {
            console.log(`Accepted Bid in League ${b.leagueId}: Buyer ${b.bidderDiscordId}, Seller ${b.sellerDiscordId}, Amount: ${b.bidAmount}, Date: ${b.timestamp || b.updatedAt}`);
        });
        
        console.log(`\n--- Checking fantasy_news for ${playerName} ---`);
        const news = await db.collection('fantasy_news').find({
            $or: [
                { message: { $regex: new RegExp(playerName, 'i') } },
                { "metadata.playerName": { $regex: new RegExp('^' + playerName + '$', 'i') } }
            ]
        }).toArray();
        news.forEach(n => {
            console.log(`News in League ${n.leagueId} (${n.type}): "${n.message}" | Date: ${n.timestamp || n.createdAt}`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
