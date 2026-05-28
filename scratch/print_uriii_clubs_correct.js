import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const matches = await db.collection('scanned_matches').find({}).toArray();
        console.log('--- BUSCANDO CLUBES DE Uriii-07- EN PARTIDOS ---');
        
        let foundAny = false;
        for (const m of matches) {
            const playersRoot = m.players || {};
            for (const clubId of Object.keys(playersRoot)) {
                const clubPlayers = playersRoot[clubId] || {};
                for (const playerId of Object.keys(clubPlayers)) {
                    const p = clubPlayers[playerId];
                    if (p.playername?.toLowerCase() === 'uriii-07-') {
                        // Buscar el nombre del club en club_profiles
                        const clubProfile = await db.collection('club_profiles').findOne({ eaClubId: clubId });
                        const clubName = clubProfile ? clubProfile.eaClubName : 'Desconocido';
                        
                        console.log(`Match ID: ${m.matchId} | Fecha: ${m.timestamp ? new Date(parseInt(m.timestamp)*1000) : 'N/A'} | Club ID: ${clubId} (${clubName}) | Rating: ${p.rating} | Minutos: ${p.secondsPlayed}`);
                        foundAny = true;
                    }
                }
            }
        }
        if (!foundAny) {
            console.log('No se encontraron partidos para Uriii-07- con esta búsqueda.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
