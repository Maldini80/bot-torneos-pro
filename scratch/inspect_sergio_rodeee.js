import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    
    // Who owns sergio_rodeee?
    const teams = await db.collection('fantasy_teams').find({
        leagueId: league._id.toString()
    }).toArray();
    
    for (const t of teams) {
        if (t.players.includes('sergio_rodeee')) {
            console.log(`Owner of sergio_rodeee: ${t.teamName} (${t.discordId})`);
        }
    }
    
    // Check all news for sergio_rodeee
    const news = await db.collection('fantasy_news').find({
        leagueId: league._id.toString(),
        message: { $regex: /sergio_rodeee/i }
    }).toArray();
    
    console.log(`\nNews for sergio_rodeee:`);
    for (const n of news) {
        console.log(`- [${n.type}] ${n.message} (Date: ${n.createdAt.toISOString()})`);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
