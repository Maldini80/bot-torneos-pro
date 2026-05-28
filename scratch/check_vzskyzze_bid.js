import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const bid = await db.collection('fantasy_market_bids').findOne({
        leagueId: league._id.toString(),
        eaPlayerName: /VZskyzze/i
    });
    
    console.log(JSON.stringify(bid, null, 2));
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
