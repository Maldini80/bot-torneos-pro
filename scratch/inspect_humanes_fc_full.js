import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    const team = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /humanes/i
    });
    
    console.log(JSON.stringify(team, null, 2));
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
