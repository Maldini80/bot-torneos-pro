// scratch/count_zerozeraa_profiles.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    const profiles = await db.collection('player_profiles').find({
        eaPlayerName: { $regex: /^zerozeraa$/i }
    }).toArray();

    console.log(`Found ${profiles.length} profiles matching ZeROzeraa:`);
    profiles.forEach(p => {
        console.log(`- ID: ${p._id} | Name: ${p.eaPlayerName} | Club: ${p.lastClub} | vpgLeague: ${p.vpgLeagueSlug} | vpgPoints: ${p.stats?.vpgPoints}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
