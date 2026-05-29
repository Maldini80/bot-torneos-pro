import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();

    // 1. Get the league info
    const leagueId = '6a12ff86007d83ffbaaf6a71';
    const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
    console.log('=== LEAGUE ===');
    console.log(league ? `${league.name} (${league._id})` : 'Not found');

    // 2. Find the team associated with bidder "liga"
    console.log('\n=== TEAMS WITH DISCORD ID "liga" OR NAME "La Liga" ===');
    const teams = await db.collection('fantasy_teams').find({
        $or: [
            { discordId: 'liga' },
            { teamName: /liga/i }
        ],
        leagueId
    }).toArray();
    console.log(JSON.stringify(teams, null, 2));

    // 3. Find GRIMA FC team info
    console.log('\n=== GRIMA FC TEAM INFO ===');
    const grimaTeam = await db.collection('fantasy_teams').findOne({
        discordId: '283974768968073216',
        leagueId
    });
    console.log(JSON.stringify(grimaTeam, null, 2));

    // 4. Find all bids for ADEJERO1989 in this league
    console.log('\n=== ALL BIDS FOR ADEJERO1989 IN THIS LEAGUE ===');
    const adejeroBids = await db.collection('fantasy_market_bids').find({
        eaPlayerName: 'ADEJERO1989',
        leagueId
    }).toArray();
    console.log(JSON.stringify(adejeroBids, null, 2));

    // 5. Get news regarding ADEJERO1989 or GRIMA FC
    console.log('\n=== NEWS FOR ADEJERO1989 OR GRIMA FC ===');
    const news = await db.collection('fantasy_market_news').find({
        leagueId,
        $or: [
            { message: /adejero/i },
            { message: /grima/i },
            { text: /adejero/i },
            { text: /grima/i }
        ]
    }).sort({ date: -1 }).toArray();
    console.log(JSON.stringify(news.map(n => ({ date: n.date, text: n.text || n.message, type: n.type, amount: n.amount })), null, 2));

    process.exit(0);
}

main().catch(console.error);
