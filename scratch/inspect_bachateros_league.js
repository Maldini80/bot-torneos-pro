// scratch/inspect_bachateros_league.js
import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    const league = await db.collection('fantasy_leagues').findOne({
        _id: new ObjectId("6a12ce2b956c0f43c400ecab")
    });
    console.log('[LEAGUE] Bachateros FC:', {
        _id: league._id,
        name: league.name,
        vpgLeagues: league.vpgLeagues,
        pointsMode: league.pointsMode
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
