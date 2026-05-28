import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "raafagonzaa98";
        const oldPoints = 103.4; // CE Europa Esports points
        
        const leagues = await db.collection('fantasy_leagues').find({}).toArray();
        console.log(`Updating basePoints for ${playerName} in leagues where it is 0/undefined...`);
        
        let updateCount = 0;
        for (const l of leagues) {
            const basePointsMap = l.basePoints || {};
            const foundKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === playerName.toLowerCase());
            
            // If basePoints is 0 or undefined in zero-mode league
            if (l.pointsMode === 'zero') {
                const currentVal = foundKey ? basePointsMap[foundKey] : undefined;
                if (currentVal === 0 || currentVal === undefined) {
                    const keyToSet = foundKey || playerName;
                    await db.collection('fantasy_leagues').updateOne(
                        { _id: l._id },
                        { $set: { [`basePoints.${keyToSet}`]: oldPoints } }
                    );
                    console.log(`- League "${l.name}": Set basePoints from ${currentVal} to ${oldPoints}`);
                    updateCount++;
                }
            }
        }
        
        console.log(`\nUpdated ${updateCount} leagues for ${playerName}.`);
        
        // Recalculate Ivanovic Team points in jam esports to reflect the change
        const leagueId = "6a10abe66bb40cd90498cca8"; // jam esports
        const team = await db.collection('fantasy_teams').findOne({ leagueId, players: playerName });
        if (team) {
            console.log(`\nRecalculating team points for "${team.teamName}" in jam esports...`);
            let totalPoints = 0;
            const updatedLeague = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            const newBasePointsMap = updatedLeague.basePoints || {};
            
            for (const pName of (team.players || [])) {
                const player = await db.collection('player_profiles').findOne({ eaPlayerName: pName });
                if (player) {
                    const rawPoints = player.stats?.vpgPoints || 0;
                    const baseVal = newBasePointsMap[player.eaPlayerName] ?? newBasePointsMap[player.eaPlayerName.toLowerCase()] ?? 0;
                    const calculatedPoints = Math.max(0, Math.round((rawPoints - baseVal) * 10) / 10);
                    totalPoints += calculatedPoints;
                }
            }
            totalPoints = Math.round(totalPoints * 10) / 10;
            await db.collection('fantasy_teams').updateOne({ _id: team._id }, { $set: { points: totalPoints } });
            console.log(`Updated team points from ${team.points} to ${totalPoints}.`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
