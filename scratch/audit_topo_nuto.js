import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const news = await db.collection('fantasy_news').find({ leagueId: league._id.toString() }).toArray();
    news.sort((a, b) => a.createdAt - b.createdAt);
    
    const teamNames = ['TOPO HIJODEPUTA', 'NUTO TUS MUERTOS'];
    
    for (const name of teamNames) {
        const team = await db.collection('fantasy_teams').findOne({ leagueId: league._id.toString(), teamName: name });
        if (!team) {
            console.log(`Team ${name} not found`);
            continue;
        }
        
        console.log(`\n========================================`);
        console.log(`Team: ${team.teamName} (Owner: ${team.discordUsername} / ${team.discordId})`);
        console.log(`Current DB Balance: ${team.balance.toLocaleString()} €`);
        
        const bids = await db.collection('fantasy_market_bids').find({
            leagueId: league._id.toString(),
            bidderDiscordId: team.discordId
        }).toArray();
        
        console.log(`\n--- BIDS (Total: ${bids.length}) ---`);
        for (const b of bids) {
            console.log(`- Player: ${b.eaPlayerName} | Bid: ${b.bidAmount.toLocaleString()} € | Status: ${b.status} | Date: ${b.createdAt.toISOString()}`);
        }
        
        console.log(`\n--- NEWS INVOLVING TEAM ---`);
        for (const n of news) {
            const msg = n.message || '';
            if (msg.toLowerCase().includes(name.toLowerCase())) {
                console.log(`- [${n.createdAt.toISOString()}] [${n.type}] ${msg}`);
            }
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
