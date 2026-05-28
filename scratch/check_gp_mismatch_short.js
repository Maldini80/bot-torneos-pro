import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();

    console.log('--- GP MISMATCH SHORT ---');
    const mismatch = await db.collection('player_profiles').find({
        lastClub: 'GUINEA PINK',
        vpgLeagueSlug: { $ne: 'superliga-spain-b' }
    }).toArray();

    console.log('Mismatched GP players (Club is Guinea Pink but League is not superliga-spain-b):');
    for (const p of mismatch) {
        console.log(`- Player: ${p.eaPlayerName} | League: ${p.vpgLeagueSlug} | TeamSlug: ${p.vpgTeamSlug}`);
    }

    process.exit(0);
}

run().catch(console.error);
