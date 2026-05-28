import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('tournamentBotDb');

    // Buscar todos los equipos que tengan el discordId de uri (688186660311007324)
    const teams = await db.collection('fantasy_teams').find({ discordId: '688186660311007324' }).toArray();
    console.log(`Encontrados ${teams.length} equipos para el Discord ID 688186660311007324:`);
    for (const t of teams) {
        const league = await db.collection('fantasy_leagues').findOne({ _id: t.leagueId });
        console.log(`- Equipo Name: "${t.teamName}" | Liga: "${league?.name}" | ID: ${t._id}`);
    }

    await client.close();
}
main().catch(console.error);
