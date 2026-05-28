import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        // Count pending bids for free agents
        const pendingFaBids = await db.collection('fantasy_market_bids').countDocuments({
            sellerDiscordId: 'SYSTEM',
            status: 'pending'
        });
        
        // Count pending transfer bids between teams
        const pendingTransferBids = await db.collection('fantasy_market_bids').countDocuments({
            sellerDiscordId: { $ne: 'SYSTEM' },
            bidderDiscordId: { $ne: 'liga' },
            status: 'pending'
        });
        
        // Count pending league offers
        const pendingLeagueOffers = await db.collection('fantasy_market_bids').countDocuments({
            bidderDiscordId: 'liga',
            status: 'pending'
        });
        
        console.log(`=== PENDING BIDS STATUS ===`);
        console.log(`- Pending Free Agent Bids (SYSTEM): ${pendingFaBids}`);
        console.log(`- Pending Transfer Bids: ${pendingTransferBids}`);
        console.log(`- Pending League Offers: ${pendingLeagueOffers}`);
        
        // Find if any listings are still active in fantasy_market_listings
        const activeListings = await db.collection('fantasy_market_listings').countDocuments({});
        console.log(`- Active Market Listings: ${activeListings}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
