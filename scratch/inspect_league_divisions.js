import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const client = await MongoClient.connect(process.env.DATABASE_URL);
    const db = client.db('tournamentBotDb');

    console.log('--- LIGAS FANTASY Y SUS DIVISIONES VPG ---');
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    for (const l of leagues) {
        console.log(`Liga: ${l.name} (ID: ${l._id})`);
        console.log(`  Divisiones VPG asociadas:`, l.vpgLeagues);
        const teamCount = await db.collection('fantasy_teams').countDocuments({ leagueId: l._id.toString() });
        console.log(`  Equipos inscritos/solicitados: ${teamCount}`);
    }

    console.log('\n--- JUGADORES EN BASE DE DATOS POR DIVISION (vpgLeagueSlug) ---');
    const aggregation = [
        {
            $group: {
                _id: '$vpgLeagueSlug',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ];
    const results = await db.collection('player_profiles').aggregate(aggregation).toArray();
    for (const r of results) {
        console.log(`  División: ${r._id || 'Sin división'} -> ${r.count} jugadores`);
    }

    await client.close();
}

run().catch(console.error);
