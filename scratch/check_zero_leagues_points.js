import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- INSPECCIONANDO LIGAS CON MODO "ZERO" Y SUS EQUIPOS ---');
        
        // 1. Obtener todas las ligas con pointsMode 'zero'
        const zeroLeagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
        if (zeroLeagues.length === 0) {
            console.log('No hay ninguna liga con modo "zero" en la base de datos.');
            return;
        }

        for (const league of zeroLeagues) {
            console.log(`\nLiga: "${league.name || league._id.toString()}" (ID: ${league._id})`);
            console.log(`Base Points keys (primeras 5):`, Object.keys(league.basePoints || {}).slice(0, 5));

            // Obtener todos los equipos de esta liga
            const teams = await db.collection('fantasy_teams').find({ leagueId: league._id.toString() }).toArray();
            console.log(`Equipos en esta liga: ${teams.length}`);
            for (const t of teams) {
                console.log(`  - Equipo: "${t.teamName}" | Puntos: ${t.points} | Presupuesto: ${t.balance?.toLocaleString('es-ES')} €`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
