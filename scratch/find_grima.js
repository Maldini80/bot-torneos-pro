import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    const leagueId = "6a12ff86007d83ffbaaf6a71";
    console.log('=== LEAGUE DETAIL ===');
    const league = await db.collection('fantasy_leagues').findOne({ _id: new Object(leagueId) });
    if (!league) {
        // try finding by string id if stored that way
        const leagueStr = await db.collection('fantasy_leagues').findOne({ _id: leagueId });
        console.log('League (string id):', leagueStr);
    } else {
        console.log('League (object id):', league);
    }

    // Since we didn't find fantasy_leagues by object id, let's search with general search or check structure
    const allLeagues = await db.collection('fantasy_leagues').find({}).toArray();
    console.log('All Leagues count:', allLeagues.length);
    const targetLeague = allLeagues.find(l => l._id.toString() === leagueId);
    console.log('Target League:', targetLeague);

    console.log('\n=== TEAMS IN LEAGUE ===');
    const teams = await db.collection('fantasy_teams').find({ leagueId: leagueId }).toArray();
    console.log('Teams in league:', teams.map(t => ({ teamName: t.teamName, discordId: t.discordId, budget: t.budget, initialBudget: t.initialBudget })));

    const grima = teams.find(t => t.discordId === "283974768968073216");
    console.log('\n=== GRIMA FC DETAIL ===');
    console.log(grima);

    console.log('\n=== RECENT NEWS FOR THIS LEAGUE ===');
    const news = await db.collection('fantasy_market_news').find({ leagueId: leagueId }).sort({ date: -1 }).limit(50).toArray();
    console.log('News:', JSON.stringify(news.map(n => ({ date: n.date, text: n.text, type: n.type, amount: n.amount })), null, 2));

    console.log('\n=== ALL BIDS IN THIS LEAGUE INVOLVING ADEJERO ===');
    const adejeroBids = await db.collection('fantasy_market_bids').find({
        leagueId: leagueId,
        eaPlayerName: "ADEJERO1989"
    }).toArray();
    console.log(JSON.stringify(adejeroBids, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
