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
    
    const buyouts = await db.collection('fantasy_buyouts').find({
        leagueId: league._id.toString(),
        $or: [
            { buyerDiscordId: topo.discordId },
            { sellerDiscordId: topo.discordId }
        ]
    }).toArray();
    
    console.log(`Buyouts for TOPO HIJODEPUTA:`);
    for (const b of buyouts) {
        console.log(`- Player: ${b.eaPlayerName} | Buyer: ${b.buyerDiscordId === topo.discordId ? 'TOPO' : b.buyerDiscordId} | Seller: ${b.sellerDiscordId === topo.discordId ? 'TOPO' : b.sellerDiscordId} | Date: ${b.timestamp}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
