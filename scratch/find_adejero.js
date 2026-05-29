import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    console.log('=== SEARCHING FOR ADEJERO1989 IN FANTASY TEAMS ===');
    const teams = await db.collection('fantasy_teams').find({
        $or: [
            { teamName: { $regex: /adejero/i } },
            { ownerDiscordId: { $regex: /adejero/i } },
            { discordId: { $regex: /adejero/i } }
        ]
    }).toArray();
    console.log('Teams found:', JSON.stringify(teams, null, 2));

    console.log('\n=== SEARCHING FOR ADEJERO1989 IN PLAYER PROFILES ===');
    const profiles = await db.collection('player_profiles').find({
        eaPlayerName: { $regex: /adejero/i }
    }).toArray();
    console.log('Profiles found:', JSON.stringify(profiles, null, 2));

    console.log('\n=== SEARCHING FOR BIDS BY OR FOR ADEJERO1989 ===');
    const bids = await db.collection('fantasy_market_bids').find({
        $or: [
            { eaPlayerName: { $regex: /adejero/i } },
            { bidderDiscordId: { $in: teams.map(t => t.discordId).filter(Boolean) } }
        ]
    }).toArray();
    console.log('Bids found:', JSON.stringify(bids, null, 2));

    console.log('\n=== SEARCHING FOR NEWS WITH ADEJERO OR VALUE 15281000 ===');
    const news = await db.collection('fantasy_market_news').find({
        $or: [
            { message: { $regex: /adejero/i } },
            { message: { $regex: /15281/ } },
            { text: { $regex: /adejero/i } },
            { text: { $regex: /15281/ } }
        ]
    }).toArray();
    console.log('News found:', JSON.stringify(news, null, 2));

    console.log('\n=== ALL NEWS FROM ADEJERO\'S LEAGUES ===');
    if (teams.length > 0) {
        const leagueIds = teams.map(t => t.leagueId);
        const leagueNews = await db.collection('fantasy_market_news').find({
            leagueId: { $in: leagueIds }
        }).sort({ date: -1 }).limit(30).toArray();
        console.log('Recent League News:', JSON.stringify(leagueNews.map(n => ({ date: n.date, text: n.text, type: n.type, amount: n.amount })), null, 2));
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
