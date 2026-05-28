import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    // 1. Mataratas fc -> 107.0
    await db.collection('fantasy_teams').updateOne(
        { teamName: 'Mataratas fc', leagueId: '6a12d81f956c0f43c400ecb0' },
        { $set: { points: 107.0 } }
    );
    console.log('Restaurado Mataratas fc a 107.0 pts');

    // 2. Climent -> 151.3
    await db.collection('fantasy_teams').updateOne(
        { teamName: 'Climent', leagueId: '6a1366e695bac5e6a15a782a' },
        { $set: { points: 151.3 } }
    );
    console.log('Restaurado Climent a 151.3 pts');

    await client.close();
}

main().catch(console.error);
