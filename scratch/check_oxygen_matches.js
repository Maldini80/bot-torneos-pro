import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== INVESTIGACIÓN: ASISTENCIAS DE panzerkh11 EN PARTIDOS ===\n');
        
        // 1. Encontrar el club Oxygen Levante
        const club = await db.collection('club_profiles').findOne({
            eaClubName: { $regex: /oxygen/i }
        });
        
        if (!club) {
            console.log('No se encontró el club Oxygen Levante en club_profiles.');
        } else {
            console.log(`Club VPG: "${club.eaClubName}" | eaClubId: ${club.eaClubId} | vpgTeamSlug: ${club.vpgTeamSlug}`);
        }
        
        // 2. Buscar partidos en scanned_matches donde haya jugado panzerkh11 hoy o ayer (26 y 27 de mayo)
        console.log('\n--- Buscando partidos recientes de panzerkh11 en scanned_matches ---');
        
        // Cargar últimos partidos de la base de datos
        const matches = await db.collection('scanned_matches').find({}).sort({ timestamp: -1, date: -1 }).limit(100).toArray();
        
        let foundMatches = 0;
        
        for (const m of matches) {
            const checkPlayers = (players) => {
                if (!players) return null;
                if (Array.isArray(players)) {
                    return players.find(p => p.playername?.toLowerCase().includes('panzer'));
                } else {
                    return Object.values(players).find(p => p.playername?.toLowerCase().includes('panzer'));
                }
            };
            
            const playerInA = checkPlayers(m.clubA?.players);
            const playerInB = checkPlayers(m.clubB?.players);
            const playerStats = playerInA || playerInB;
            
            if (playerStats) {
                foundMatches++;
                const dateStr = m.timestamp ? new Date(m.timestamp).toLocaleString('es-ES') : (m.date ? new Date(m.date).toLocaleString('es-ES') : 'Fecha desconocida');
                const homeName = m.clubA?.name || m.homeTeam?.name || 'Local';
                const awayName = m.clubB?.name || m.awayTeam?.name || 'Visitante';
                const homeScore = m.clubA?.score ?? m.homeTeam?.score ?? '?';
                const awayScore = m.clubB?.score ?? m.awayTeam?.score ?? '?';
                
                console.log(`\nPartido [${dateStr}]: ${homeName} ${homeScore} - ${awayScore} ${awayName}`);
                console.log(`- Nombre en partido: ${playerStats.playername}`);
                console.log(`- Valoración (Rating): ${playerStats.rating}`);
                console.log(`- Goles en partido: ${playerStats.goals || 0}`);
                console.log(`- Asistencias en partido: ${playerStats.assists || 0}`);
                console.log(`- Pases completados: ${playerStats.passesmade || 0} / Intentados: ${playerStats.passattempts || 0}`);
            }
            if (foundMatches >= 5) break;
        }
        
        if (foundMatches === 0) {
            console.log('No se encontraron partidos recientes en scanned_matches para "panzerkh".');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
