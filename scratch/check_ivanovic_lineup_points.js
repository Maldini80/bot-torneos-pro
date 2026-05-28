import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagueId = "6a10abe66bb40cd90498cca8"; // jam esports
        const team = await db.collection('fantasy_teams').findOne({ leagueId, teamName: "Ivanovic Team" });
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
        const basePointsMap = league.basePoints || {};
        
        console.log(`=== IVANOVIC TEAM PLAYER POINTS BREAKDOWN ===`);
        console.log(`Team Name: "${team.teamName}"`);
        console.log(`Team Total Points in DB: ${team.points}`);
        
        let sumCalculated = 0;
        
        for (const pName of (team.players || [])) {
            const player = await db.collection('player_profiles').findOne({ eaPlayerName: pName });
            if (player) {
                const rawPoints = player.stats?.vpgPoints || 0;
                const baseVal = basePointsMap[pName] ?? basePointsMap[pName.toLowerCase()] ?? 0;
                const calculatedPoints = Math.max(0, Math.round((rawPoints - baseVal) * 10) / 10);
                sumCalculated += calculatedPoints;
                console.log(`- Player: "${pName}" | Raw: ${rawPoints} | Base: ${baseVal} | Calculated: ${calculatedPoints}`);
            } else {
                console.log(`- Player: "${pName}" (Profile NOT found in DB!)`);
            }
        }
        
        console.log(`\nSum of Calculated Player Points: ${Math.round(sumCalculated * 10) / 10}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
