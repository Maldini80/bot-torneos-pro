import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== VERIFICACIÓN DE PUNTOS OBTENIDOS POR LOS JUGADORES ROBADOS ===\n');
        
        const playerNames = ['ravenn8', 'EUREX_luvchenko', 'Juanlukaku'];
        
        for (const pName of playerNames) {
            const player = await db.collection('player_profiles').findOne({ eaPlayerName: pName });
            if (!player) {
                console.log(`Jugador "${pName}" no encontrado.`);
                continue;
            }
            
            console.log(`Jugador: ${player.eaPlayerName}`);
            console.log(`- Club VPG: ${player.lastClub}`);
            console.log(`- Liga VPG: ${player.vpgLeagueSlug}`);
            
            // Ver si hay delta de puntos en el sync de hoy
            // El sync calcula la diferencia entre el valor actual en la web y el baseline guardado en vpgLastRawPerLeague o vpgLastRaw.
            // Para el cálculo de hoy, el delta es: actual - anterior
            // Veamos qué estadísticas crudas actuales tiene en el perfil
            const stats = player.stats || {};
            const raw = stats.vpgLastRawPerLeague?.[player.vpgLeagueSlug] || stats.vpgLastRaw || {};
            
            console.log(`- Stats acumuladas en BD: PJ: ${stats.matchesPlayed} | Puntos VPG: ${stats.vpgPoints}`);
            console.log(`- Stats del último sync (raw): PJ: ${raw.matchesPlayed} | Puntos VPG: ${raw.vpgPoints}`);
            
            // Veamos en qué equipos está guardado en fantasy_teams ahora mismo
            const currentTeams = await db.collection('fantasy_teams').find({
                players: player.eaPlayerName
            }).toArray();
            console.log(`- Pertenece actualmente a los equipos Fantasy:`, currentTeams.map(t => t.teamName));
            
            // Buscar en fantasy_news si hubo algún registro de puntos ganados por estos jugadores hoy
            const news = await db.collection('fantasy_news').find({
                message: { $regex: new RegExp(player.eaPlayerName, 'i') }
            }).toArray();
            
            if (news.length > 0) {
                console.log(`- Noticias relacionadas con él:`);
                news.forEach(n => console.log(`  [${new Date(n.createdAt).toLocaleDateString()}] ${n.message}`));
            } else {
                console.log(`- Sin noticias de puntos para este jugador.`);
            }
            console.log('----------------------------------------------------');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
