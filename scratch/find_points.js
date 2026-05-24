import { connectDb, getDb } from '../database.js';

async function main() {
    await connectDb();
    const db = getDb();
    
    // Find players with specific vpgPoints or points
    const players = await db.collection('player_profiles').find({
        $or: [
            { 'stats.vpgPoints': 57.5 },
            { 'stats.vpgPoints': 29.4 },
            { 'stats.vpgPoints': 0.3 },
            { 'stats.vpgPoints': 20.8 },
            { eaPlayerName: 'MonKeyDFFYLU' },
            { eaPlayerName: 'ruben10_03' },
            { eaPlayerName: 'Aaron14' }
        ]
    }).toArray();

    console.log(`Found ${players.length} players:`);
    for (const p of players) {
        console.log(`- ${p.eaPlayerName}: vpgPoints=${p.stats?.vpgPoints}, slug=${p.vpgLeagueSlug}, club=${p.lastClub}`);
    }

    process.exit(0);
}

main().catch(console.error);
