import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    // Buscar por ID del equipo de Bachateros que encontramos en find_uri_fc: 6a12d5d1956c0f43c400ecae
    const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId('6a12d5d1956c0f43c400ecae') });
    console.log('Equipo por ID:', team ? { teamName: team.teamName, leagueId: team.leagueId, points: team.points } : 'null');

    await client.close();
}

main().catch(console.error);
