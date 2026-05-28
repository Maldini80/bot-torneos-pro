// scratch/inspect_zerozeraa_history.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Search player profile
    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /^zerozeraa$/i }
    });
    console.log('[ZEROZERAA] Profile stats:', player ? {
        eaPlayerName: player.eaPlayerName,
        stats: player.stats,
        vpgLeagueSlug: player.vpgLeagueSlug,
        lastClub: player.lastClub
    } : 'Not found');

    // 2. Search history for this player in DonpeSports league (6a12ce2b956c0f43c400ecab)
    const history = await db.collection('fantasy_player_history').find({
        playerName: { $regex: /^zerozeraa$/i },
        leagueId: "6a12ce2b956c0f43c400ecab"
    }).toArray();
    console.log('[ZEROZERAA] History in DonpeSports:', history);

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
