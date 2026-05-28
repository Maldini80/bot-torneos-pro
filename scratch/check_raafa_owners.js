import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "raafagonzaa98";
        
        const teams = await db.collection('fantasy_teams').find({
            players: playerName
        }).toArray();
        
        console.log(`=== ALL FANTASY TEAMS OWNING RAAFAGONZAA98 ===`);
        for (const team of teams) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(team.leagueId) });
            if (!league) continue;
            
            const basePointsMap = league.basePoints || {};
            const baseVal = basePointsMap[playerName] ?? 0;
            const playerProfile = await db.collection('player_profiles').findOne({ eaPlayerName: playerName });
            const rawPoints = playerProfile.stats?.vpgPoints || 0;
            const calculatedPoints = Math.max(0, Math.round((rawPoints - baseVal) * 10) / 10);
            
            console.log(`- League: "${league.name}" (ID: ${league._id})`);
            console.log(`  * Manager Team: "${team.teamName}" (Discord ID: ${team.discordId})`);
            console.log(`  * BasePoints in this league: ${baseVal}`);
            console.log(`  * Points Contributed on Card: ${calculatedPoints}`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
