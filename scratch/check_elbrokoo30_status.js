import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find who owns elbrokoo30 in the TRANSFORMERS CF league
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    
    const owner = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        players: { $regex: /^elbrokoo30$/i }
    });
    
    console.log(`Owner of elbrokoo30:`, owner ? `${owner.teamName} (${owner.discordId})` : 'None (still a Free Agent)');
    
    // Find all buyouts for elbrokoo30 today in this league
    const buyouts = await db.collection('fantasy_buyouts').find({
        leagueId: league._id.toString(),
        eaPlayerName: { $regex: /^elbrokoo30$/i }
    }).toArray();
    
    console.log(`\nBuyouts for elbrokoo30:`, buyouts.length);
    for (const b of buyouts) {
        console.log(`- Buyer: ${b.buyerDiscordId} | Date: ${b.timestamp}`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
