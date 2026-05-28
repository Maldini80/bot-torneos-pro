import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== ANÁLISIS DEL JUGADOR: xdoku o similares ===\n');
        
        const queryName = 'doku';
        
        // Buscar por coincidencia parcial en player_profiles
        const players = await db.collection('player_profiles').find({
            eaPlayerName: { $regex: new RegExp(queryName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }
        }).toArray();
        
        if (players.length === 0) {
            console.log(`No se encontró ningún jugador con "${queryName}" en su nombre.`);
            return;
        }
        
        console.log(`Se encontraron ${players.length} coincidencias:\n`);
        for (const player of players) {
            console.log(`Nombre EA: ${player.eaPlayerName}`);
            console.log(`Nacionalidad: ${player.nationality || 'N/A'}`);
            console.log(`Posición: ${player.lastPosition || 'N/A'}`);
            console.log(`Club VPG: ${player.lastClub || 'N/A'} (Slug: ${player.vpgTeamSlug || 'Sin equipo'})`);
            console.log(`Liga VPG: ${player.vpgLeagueSlug || 'Sin liga'}`);
            
            const calc = calculatePlayerPointsAndPrice(player);
            console.log(`Puntos VPG acumulados: ${calc.points}`);
            console.log(`Valoración Media: ${calc.avgRating.toFixed(2)}`);
            console.log(`Valor de Mercado: ${calc.price.toLocaleString('es-ES')} €`);
            
            // Stats detalladas
            const stats = player.stats || {};
            console.log(`Stats - PJ: ${stats.matchesPlayed || 0} | Goles: ${stats.goals || 0} | Asistencias: ${stats.assists || 0} | Porterías a Cero: ${stats.cleanSheets || 0}`);
            
            // Último raw
            const raw = stats.vpgLastRawPerLeague?.[player.vpgLeagueSlug] || stats.vpgLastRaw || {};
            console.log(`Último raw en BD - PJ: ${raw.matchesPlayed || 0} | Puntos VPG: ${raw.vpgPoints || 0}`);
            
            // Buscar dueño en fantasy_teams
            const ownerTeam = await db.collection('fantasy_teams').findOne({
                players: { $regex: new RegExp('^' + player.eaPlayerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            if (ownerTeam) {
                console.log(`Propietario en Fantasy: ${ownerTeam.teamName} (${ownerTeam.discordUsername || 'Sin Discord'})`);
                // Ver si está en la alineación
                let isStarter = false;
                let alignedPos = 'No';
                if (ownerTeam.lineup) {
                    if (ownerTeam.lineup.POR && ownerTeam.lineup.POR.toLowerCase() === player.eaPlayerName.toLowerCase()) {
                        isStarter = true;
                        alignedPos = 'POR';
                    }
                    ['DFC', 'MC', 'DC'].forEach(pos => {
                        if (Array.isArray(ownerTeam.lineup[pos])) {
                            const idx = ownerTeam.lineup[pos].findIndex(x => x && x.toLowerCase() === player.eaPlayerName.toLowerCase());
                            if (idx !== -1) {
                                isStarter = true;
                                alignedPos = `${pos} [índice ${idx}]`;
                            }
                        }
                    });
                }
                console.log(`¿Alineado de titular?: ${isStarter ? '✅ SÍ (' + alignedPos + ')' : '❌ NO'}`);
            } else {
                console.log('Propietario en Fantasy: 👤 Jugador Libre');
            }
            
            // Buscar noticias de puntos hoy
            const news = await db.collection('fantasy_news').find({
                message: { $regex: new RegExp(player.eaPlayerName, 'i') }
            }).toArray();
            if (news.length > 0) {
                console.log('Noticias de hoy asociadas:');
                news.forEach(n => console.log(`- [${new Date(n.createdAt).toLocaleTimeString('es-ES')}] ${n.message}`));
            } else {
                console.log('Sin noticias de puntos hoy.');
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
