import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "zzRaydenzz";
        const playerLower = playerName.toLowerCase();
        
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^' + playerName + '$', 'i') }
        }).toArray();
        
        console.log(`Found ${teams.length} teams owning Rayden:`);
        for (const t of teams) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(t.leagueId) });
            const basePointsMap = league?.basePoints || {};
            const basePoints = basePointsMap[playerLower] ?? basePointsMap[playerName] ?? null;
            
            console.log(`League: "${league?.name}" (ID: ${t.leagueId})`);
            console.log(`  Team: "${t.teamName}" (Manager Discord: ${t.discordId})`);
            console.log(`  Team Total Points: ${t.points}`);
            console.log(`  Rayden basePoints in League: ${basePoints}`);
            console.log(`  Rayden in lineup:`, JSON.stringify(t.lineup));
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
