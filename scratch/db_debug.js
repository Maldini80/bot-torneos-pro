import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    const playerColl = db.collection('player_profiles');
    const leagueColl = db.collection('fantasy_leagues');
    const teamColl = db.collection('fantasy_teams');

    // Stats
    const totalPlayers = await playerColl.countDocuments();
    const playersWithRatings = await playerColl.countDocuments({ "stats.ratings": { $exists: true, $not: { $size: 0 } } });
    console.log(`Total players: ${totalPlayers}`);
    console.log(`Players with ratings: ${playersWithRatings}`);

    // Inspect one league
    const league = await leagueColl.findOne();
    console.log('\nFantasy League Example:');
    console.log(JSON.stringify(league ? {
        _id: league._id,
        name: league.name,
        pointsMode: league.pointsMode,
        basePointsSample: Object.entries(league.basePoints || {}).slice(0, 5)
    } : null, null, 2));

    // Inspect one team
    const team = await teamColl.findOne();
    console.log('\nFantasy Team Example:');
    console.log(JSON.stringify(team ? {
        _id: team._id,
        teamName: team.teamName,
        points: team.points,
        players: team.players
    } : null, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
