import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagueId = "6a10abe66bb40cd90498cca8"; // jam esports
        const teamName = "Ivanovic Team";
        const originalPoints = 221.5;
        
        const res = await db.collection('fantasy_teams').updateOne(
            { leagueId, teamName },
            { $set: { points: originalPoints } }
        );
        
        if (res.modifiedCount > 0) {
            console.log(`Successfully reverted "${teamName}" points to ${originalPoints} in jam esports.`);
        } else {
            console.log(`Failed to update or points were already ${originalPoints}.`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
