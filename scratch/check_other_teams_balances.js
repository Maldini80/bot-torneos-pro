import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ name: /transformers/i });
    
    const grima = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /grima/i
    });
    
    const wolteam = await db.collection('fantasy_teams').findOne({
        leagueId: league._id.toString(),
        teamName: /wolteam/i
    });
    
    console.log(`GRIMA FC Balance:`, grima ? grima.balance.toLocaleString('es-ES') : 'Not found', '€');
    console.log(`Wolteam Balance :`, wolteam ? wolteam.balance.toLocaleString('es-ES') : 'Not found', '€');
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
