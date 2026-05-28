import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const uri = process.env.DATABASE_URL;

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');

    console.log('=== VERIFICACIÓN ULTRA-PRECISA DE LA BD ===\n');

    // 1. Minabo de Kiev en Ceuta Guardians (6a1171bc7fbb0c9ddd4268e5)
    // Tenía 543.1. Se le restaron 145.9 por 13alvaro12. Debe tener 397.2.
    const minabo = await db.collection('fantasy_teams').findOne({ teamName: 'Minabo de Kiev', leagueId: '6a1171bc7fbb0c9ddd4268e5' });
    console.log(`Minabo de Kiev: Puntos = ${minabo?.points} (Esperado: 397.2) | ¿Ok?: ${minabo?.points === 397.2 ? '✅' : '❌'}`);

    // 2. Real Fachadolid en Cryzen gaming (6a12b9de0e3fb8a695696e81)
    // Tenía 278.8. Se le restaron 104.7 por nestor007. Debe tener 174.1.
    const fachadolid = await db.collection('fantasy_teams').findOne({ teamName: 'Real Fachadolid', leagueId: '6a12b9de0e3fb8a695696e81' });
    console.log(`Real Fachadolid: Puntos = ${fachadolid?.points} (Esperado: 174.1) | ¿Ok?: ${fachadolid?.points === 174.1 ? '✅' : '❌'}`);

    // 3. URI FC en Bachateros FC (6a12ce2b956c0f43c400ecab)
    // Tenía 593.4. Se le restaron 145.9 por 13alvaro12. Debe tener 447.5.
    const urifc = await db.collection('fantasy_teams').findOne({ teamName: 'URI FC', leagueId: '6a12ce2b956c0f43c400ecab' });
    console.log(`URI FC (Bachateros): Puntos = ${urifc?.points} (Esperado: 447.5) | ¿Ok?: ${urifc?.points === 447.5 ? '✅' : '❌'}`);

    // 4. Mataratas fc en Cadiz CFeSports (6a12d81f956c0f43c400ecb0)
    // Se saltó porque fue compensado correctamente. Debe tener 107.0.
    const mataratas = await db.collection('fantasy_teams').findOne({ teamName: 'Mataratas fc', leagueId: '6a12d81f956c0f43c400ecb0' });
    console.log(`Mataratas fc: Puntos = ${mataratas?.points} (Esperado: 107.0) | ¿Ok?: ${mataratas?.points === 107.0 ? '✅' : '❌'}`);

    // 5. Néstor en ESPARTANOS CF (6a10feac81beb9b56df55c0c)
    // Se saltó porque compró a 13alvaro12 después del sync. Debe tener 482.1.
    const nestor = await db.collection('fantasy_teams').findOne({ teamName: 'Néstor', leagueId: '6a10feac81beb9b56df55c0c' });
    console.log(`Néstor (ESPARTANOS): Puntos = ${nestor?.points} (Esperado: 482.1) | ¿Ok?: ${nestor?.points === 482.1 ? '✅' : '❌'}`);

    await client.close();
}

main().catch(console.error);
