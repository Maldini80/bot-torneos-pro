import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';

async function main() {
    await connectDb();
    const db = getDb();
    
    const leagueId = '6a0f8c20ae3aed564b3915a4';
    console.log(`Searching for league with ID: ${leagueId}`);
    
    const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
    if (!league) {
        console.error("League not found!");
        process.exit(1);
    }
    
    console.log(`Found league: ${league.name}. pointsMode: ${league.pointsMode}`);
    if (league.pointsMode !== 'zero') {
        console.error("League is not in ZERO points mode.");
        process.exit(1);
    }
    
    console.log("Fetching all player profiles to reset basePoints...");
    const players = await db.collection('player_profiles').find({ "stats.vpgPoints": { $exists: true } }).toArray();
    console.log(`Found ${players.length} players with VPG points.`);
    
    const newBasePoints = {};
    for (const p of players) {
        if (p.eaPlayerName) {
            newBasePoints[p.eaPlayerName] = p.stats.vpgPoints || 0;
        }
    }
    
    console.log("Updating basePoints in league document...");
    await db.collection('fantasy_leagues').updateOne(
        { _id: league._id },
        { $set: { basePoints: newBasePoints } }
    );
    
    console.log("Recalculating fantasy team points in the league...");
    const teams = await db.collection('fantasy_teams').find({ leagueId }).toArray();
    let updatedTeams = 0;
    for (const team of teams) {
        let totalPoints = 0;
        for (const playerName of (team.players || [])) {
            const player = await db.collection('player_profiles').findOne({ eaPlayerName: playerName });
            if (player) {
                const rawPoints = player.stats?.vpgPoints || 0;
                let base = newBasePoints[player.eaPlayerName] || 0;
                // Try case-insensitive search
                if (newBasePoints[player.eaPlayerName] === undefined) {
                    const foundKey = Object.keys(newBasePoints).find(k => k.toLowerCase() === player.eaPlayerName.toLowerCase());
                    if (foundKey) {
                        base = newBasePoints[foundKey];
                    }
                }
                const playerPoints = Math.max(0, rawPoints - base);
                totalPoints += playerPoints;
            }
        }
        await db.collection('fantasy_teams').updateOne(
            { _id: team._id },
            { $set: { points: totalPoints } }
        );
        updatedTeams++;
    }
    
    console.log(`Recalculation complete. Updated base points for ${Object.keys(newBasePoints).length} players and recalculated ${updatedTeams} teams.`);
    process.exit(0);
}

main().catch(console.error);
