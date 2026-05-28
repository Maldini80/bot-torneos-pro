// scratch/inspect_not_ven00m_detail.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /^not_ven00m$/i }
    });
    console.log(JSON.stringify(player, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
