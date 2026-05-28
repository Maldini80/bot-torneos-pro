// scratch/trace_zerozeraa_all_history.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    const history = await db.collection('fantasy_player_history').find({
        playerName: { $regex: /^zerozeraa$/i }
    }).sort({ createdAt: 1 }).toArray();

    console.log(`Found ${history.length} history records for ZeROzeraa:`);
    for (const h of history) {
        // Fetch league name
        const league = await db.collection('fantasy_leagues').findOne({ _id: typeof h.leagueId === 'string' ? h.leagueId : h.leagueId.toString() });
        const leagueName = league ? league.name : 'Unknown';
        console.log(`- League: "${leagueName}" | Points: ${h.points} | wasStarter: ${h.wasStarter} | TeamId: ${h.teamId} | Date: ${h.createdAt.toISOString()}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
