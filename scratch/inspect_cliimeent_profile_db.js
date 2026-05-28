import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /^cliimeent$/i }
    });
    
    console.log('[CLIIMEENT] Profile stats:', player ? {
        eaPlayerName: player.eaPlayerName,
        stats: player.stats,
        points: player.points
    } : 'Not found');
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
