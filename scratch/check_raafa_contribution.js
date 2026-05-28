import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagueId = "6a10abe66bb40cd90498cca8"; // jam esports
        const playerName = "raafagonzaa98";
        
        // Find the team that owns him in jam esports
        const team = await db.collection('fantasy_teams').findOne({
            leagueId,
            players: playerName
        });
        
        console.log(`=== RAAFAGONZAA98 IN JAM ESPORTS ===`);
        if (team) {
            console.log(`Owner: "${team.teamName}" (Manager Discord ID: ${team.discordId})`);
            console.log(`Team Total Points in DB: ${team.points}`);
            
            // Calculate what his points are on the lineup card (rawPoints - basePoints)
            const playerProfile = await db.collection('player_profiles').findOne({ eaPlayerName: playerName });
            const rawPoints = playerProfile.stats?.vpgPoints || 0;
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(leagueId) });
            const basePointsVal = league.basePoints?.[playerName] || 0;
            const calculatedPoints = Math.max(0, Math.round((rawPoints - basePointsVal) * 10) / 10);
            
            console.log(`Player Raw VPG Points: ${rawPoints}`);
            console.log(`Player Base Points in League: ${basePointsVal}`);
            console.log(`Player Display Points (Calculated): ${calculatedPoints}`);
        } else {
            console.log(`Player is a Free Agent in Jam Esports.`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
