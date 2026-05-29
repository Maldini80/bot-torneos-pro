import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    console.log('=== SEARCHING ALL BIDS FOR ADEJERO1989 ===');
    const bids = await db.collection('fantasy_market_bids').find({
        eaPlayerName: "ADEJERO1989"
    }).toArray();
    console.log(JSON.stringify(bids, null, 2));

    console.log('\n=== SEARCHING ALL TEAMS OWNING ADEJERO1989 ===');
    const teams = await db.collection('fantasy_teams').find({
        players: "ADEJERO1989"
    }).toArray();
    for (const team of teams) {
        const league = await db.collection('fantasy_leagues').findOne({ _id: new Object(team.leagueId) });
        console.log(`Team: ${team.teamName} (League: ${league ? league.name : team.leagueId}), Balance: ${team.balance}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
