// scratch/inspect_zerozeraa.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Search player profile
    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /^zerozeraa$/i }
    });
    console.log('[ZEROZERAA] Profile:', player);

    // 2. Search history for this player
    const history = await db.collection('fantasy_player_history').find({
        playerName: { $regex: /^zerozeraa$/i }
    }).toArray();
    console.log('[ZEROZERAA] History:', history);

    // 3. Search basePoints in leagues
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    for (const l of leagues) {
        if (l.basePoints) {
            const key = Object.keys(l.basePoints).find(k => k.toLowerCase() === 'zerozeraa');
            if (key) {
                console.log(`[ZEROZERAA] League: "${l.name}" (${l._id}) - basePoints[${key}] = ${l.basePoints[key]}`);
            }
        }
    }

    // 4. Search teams owning him
    const teams = await db.collection('fantasy_teams').find({
        players: { $regex: /^zerozeraa$/i }
    }).toArray();
    for (const t of teams) {
        console.log(`[ZEROZERAA] Owned by Team: "${t.teamName}" in League: "${t.leagueId}" - points: ${t.points}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
