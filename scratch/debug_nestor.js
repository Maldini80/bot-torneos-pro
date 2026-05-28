import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    const teams = await db.collection('fantasy_teams').find({ teamName: 'Néstor' }).toArray();
    for (const t of teams) {
        console.log(`Equipo ID: ${t._id} | teamName: ${t.teamName} | leagueId: ${t.leagueId} | points: ${t.points}`);
    }

    await client.close();
}

main().catch(console.error);
