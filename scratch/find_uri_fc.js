import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    const teams = await db.collection('fantasy_teams').find({ teamName: 'URI FC' }).toArray();
    for (const t of teams) {
        const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(t.leagueId) });
        console.log(`Equipo ID: ${t._id} | Liga: "${league?.name}" | Puntos: ${t.points} | Jugadores: ${t.players.join(', ')}`);
        console.log(`  Lineup: ${JSON.stringify(t.lineup)}`);
    }

    await client.close();
}

main().catch(console.error);
