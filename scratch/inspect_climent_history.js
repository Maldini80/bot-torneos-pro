// scratch/inspect_climent_history.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    const history = await db.collection('fantasy_player_history').find({
        playerName: { $regex: /^cliimeent$/i }
    }).sort({ createdAt: 1 }).toArray();

    console.log(`Found ${history.length} history records for CLIIMEENT:`);
    for (const h of history) {
        console.log(`- Points: ${h.points} | wasStarter: ${h.wasStarter} | TeamId: ${h.teamId} | Date: ${h.createdAt.toISOString()}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
