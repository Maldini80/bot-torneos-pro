import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- BUSCANDO POSIBLES CASOS SIMILARES EN LA BASE DE DATOS ---');
        const playerColl = db.collection('player_profiles');
        
        // 1. Buscar jugadores con vpgLeagueSlug (VPG) que tengan estadísticas detalladas del crawler de EA
        // (La API de VPG no da pases completados, entradas hechas, etc. Solo da goles/asistencias/partidos y puntos).
        // Si tienen passesMade > 0, tacklesMade > 0 o saves > 0 (y no son POR), es porque el crawler de EA los tocó.
        const contaminatedPlayers = await playerColl.find({
            vpgLeagueSlug: { $exists: true, $ne: null },
            $or: [
                { "stats.passesMade": { $gt: 0 } },
                { "stats.tacklesMade": { $gt: 0 } }
            ]
        }).toArray();

        console.log(`\nJugadores VPG con estadísticas detalladas de EA (posible contaminación): ${contaminatedPlayers.length}`);
        for (const p of contaminatedPlayers) {
            console.log(`- Jugador: ${p.eaPlayerName} | Club actual en DB: ${p.lastClub} | Liga: ${p.vpgLeagueSlug}`);
            console.log(`  Stats: Partidos: ${p.stats?.matchesPlayed} | Puntos VPG: ${p.stats?.vpgPoints}`);
            console.log(`  Pases: ${p.stats?.passesMade} | Entradas: ${p.stats?.tacklesMade} | Notas: [${p.stats?.ratings?.join(', ')}]`);
        }

        // 2. Buscar si hay jugadores duplicados (que tengan el mismo vpgProfile.username o similitudes altas)
        console.log('\n--- BUSCANDO PERFILES DUPLICADOS ACTIVOS/INACTIVOS ---');
        const allPlayers = await playerColl.find({ excluded: { $ne: true } }).toArray();
        const vpgUsernames = {};
        
        for (const p of allPlayers) {
            if (p.vpgProfile && p.vpgProfile.username) {
                const usernameLower = p.vpgProfile.username.toLowerCase();
                if (!vpgUsernames[usernameLower]) {
                    vpgUsernames[usernameLower] = [];
                }
                vpgUsernames[usernameLower].push(p);
            }
        }

        let duplicatesCount = 0;
        for (const username in vpgUsernames) {
            const list = vpgUsernames[username];
            if (list.length > 1) {
                duplicatesCount++;
                console.log(`\nDuplicado detectado para usuario VPG: "${username}"`);
                for (const p of list) {
                    console.log(`  - Ficha: ${p.eaPlayerName} | Club: ${p.lastClub} | VPG Liga: ${p.vpgLeagueSlug || 'Ninguna (Crawler)'}`);
                }
            }
        }
        console.log(`\nTotal de usuarios con duplicados: ${duplicatesCount}`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
