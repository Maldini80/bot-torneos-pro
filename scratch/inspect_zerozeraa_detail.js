// scratch/inspect_zerozeraa_detail.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /^zerozeraa$/i }
    });
    console.log(JSON.stringify(player, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
