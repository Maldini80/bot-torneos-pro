import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    const team = await db.collection('teams').findOne({ vpgTeamSlug: { $exists: true } });
    console.log("Team keys:", Object.keys(team));
    
    // Find if any team has players array populated
    const teamsWithPlayers = await db.collection('teams').find({ players: { $exists: true, $not: { $size: 0 } } }).toArray();
    console.log("Teams with players count:", teamsWithPlayers.length);
    if (teamsWithPlayers.length > 0) {
        console.log("Sample team with players:", teamsWithPlayers[0].name, "Players count:", teamsWithPlayers[0].players.length);
    }
    
    await client.close();
}
main().catch(console.error);
