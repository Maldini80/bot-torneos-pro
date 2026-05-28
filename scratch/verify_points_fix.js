import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    console.log('=== VERIFICANDO LA CORRECCIÓN EN LA BASE DE DATOS ===\n');

    const checkTeams = [
        { teamName: 'Minabo de Kiev', expectedPts: 397.2 },
        { teamName: 'Néstor', expectedPts: 336.2 },
        { teamName: 'URI FC', expectedPts: 447.5 },
        { teamName: 'Real Fachadolid', expectedPts: 174.1 },
        { teamName: 'Mataratas fc', expectedPts: 107.0 }
    ];

    for (const check of checkTeams) {
        const team = await db.collection('fantasy_teams').findOne({ teamName: check.teamName });
        if (team) {
            console.log(`Equipo: "${team.teamName}"`);
            console.log(`  Puntos en DB:     ${team.points}`);
            console.log(`  Puntos esperados: ${check.expectedPts}`);
            console.log(`  ¿Correcto?:       ${team.points === check.expectedPts ? '✅ SÍ' : '❌ NO'}`);
        } else {
            console.log(`❌ No se encontró el equipo "${check.teamName}"`);
        }
        console.log('');
    }

    await client.close();
}

main().catch(console.error);
