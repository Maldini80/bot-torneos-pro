import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const buyouts = await db.collection('fantasy_buyouts').find({ leagueId: league._id.toString() }).toArray();
    
    console.log(`Checking ${buyouts.length} buyouts in TRANSFORMERS CF:`);
    for (const bo of buyouts) {
        const buyer = await db.collection('fantasy_teams').findOne({ discordId: bo.buyerDiscordId, leagueId: league._id.toString() });
        const seller = await db.collection('fantasy_teams').findOne({ discordId: bo.sellerDiscordId, leagueId: league._id.toString() });
        
        console.log(`\n- Player: ${bo.eaPlayerName} | Date: ${bo.timestamp}`);
        console.log(`  Buyer: ${buyer ? buyer.teamName : 'Unknown'} (${bo.buyerDiscordId})`);
        console.log(`    Has player: ${buyer && buyer.players.includes(bo.eaPlayerName) ? 'YES' : 'NO'}`);
        console.log(`  Seller: ${seller ? seller.teamName : 'Unknown'} (${bo.sellerDiscordId})`);
        console.log(`    Has player: ${seller && seller.players.includes(bo.eaPlayerName) ? 'YES' : 'NO'}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
