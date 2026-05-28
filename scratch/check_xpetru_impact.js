import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function run() {
    await connectDb();
    const db = getDb();
    
    // Find xpetruu
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: "xpetruu" });
    if (!player) {
        console.log('No xpetruu found');
        process.exit(0);
    }
    
    console.log(`=== XPETRUU STATS ===`);
    console.log(`vpgPoints: ${player.stats?.vpgPoints}`);
    console.log(`matchesPlayed: ${player.stats?.matchesPlayed}`);
    
    // Search teams that own him and check their points/balance
    console.log(`\n=== TEAMS OWNING XPETRUU ===`);
    const teams = await db.collection('fantasy_teams').find({
        players: player.eaPlayerName
    }).toArray();
    
    const leagues = await db.collection('fantasy_leagues').find().toArray();
    const leaguesMap = new Map(leagues.map(l => [l._id.toString(), l]));
    
    for (const team of teams) {
        const league = leaguesMap.get(team.leagueId);
        const lName = league ? league.name : 'Unknown';
        const basePointsMap = league ? (league.basePoints || {}) : {};
        const baseVal = basePointsMap[player.eaPlayerName] ?? basePointsMap[player.eaPlayerName.toLowerCase()] ?? 'Undefined';
        
        console.log(`- Liga: "${lName}" | Equipo: "${team.teamName}"`);
        console.log(`  * Team Points: ${team.points} | Team Balance: ${team.balance.toLocaleString('es-ES')} €`);
        console.log(`  * Player Base Points in League: ${baseVal}`);
    }
    
    // Let's search fantasy news for xpetruu
    console.log(`\n=== FANTASY NEWS FOR XPETRUU ===`);
    const news = await db.collection('fantasy_news').find({
        $or: [
            { text: { $regex: /xpetru/i } },
            { "extraData.teamName": { $in: teams.map(t => t.teamName) } }
        ]
    }).sort({ timestamp: -1 }).limit(10).toArray();
    
    for (const item of news) {
        console.log(`- [${item.timestamp.toISOString()}] [${item.type}] ${item.text}`);
    }

    process.exit(0);
}

run();
