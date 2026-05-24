import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    
    // Find all teams where players array is not empty
    const teams = await db.collection('teams').find({ players: { $exists: true, $not: { $size: 0 } } }).toArray();
    console.log("Teams with players:", teams.length);
    teams.slice(0, 5).forEach(t => {
        console.log(`Team: ${t.name} (${t.abbreviation}), Manager: ${t.managerId}, Players Count: ${t.players.length}`);
        console.log("Players:", t.players);
    });
    
    await client.close();
}
main().catch(console.error);
