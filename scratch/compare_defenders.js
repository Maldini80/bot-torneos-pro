import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== COMPARATIVA DE DEFENSORES (DFC, LD, LI, CAD, CAI, CARR) ===\n');
        
        const defenders = await db.collection('player_profiles').find({
            $or: [
                { lastPosition: { $in: ['DFC', 'LD', 'LI', 'CAD', 'CAI', 'CARR'] } },
                { manualPosition: { $in: ['DFC', 'LD', 'LI', 'CAD', 'CAI', 'CARR'] } }
            ]
        }).toArray();
        
        const enrichedDefenders = defenders.map(p => {
            const calc = calculatePlayerPointsAndPrice(p);
            return {
                eaPlayerName: p.eaPlayerName,
                lastClub: p.lastClub,
                position: p.manualPosition || p.lastPosition,
                vpgLeagueSlug: p.vpgLeagueSlug,
                matchesPlayed: p.stats?.matchesPlayed || 0,
                goals: p.stats?.goals || 0,
                assists: p.stats?.assists || 0,
                cleanSheets: p.stats?.cleanSheets || 0,
                wins: p.stats?.wins || 0,
                losses: p.stats?.losses || 0,
                avgRating: calc.avgRating,
                points: calc.points,
                price: calc.price
            };
        });
        
        // 1. Ordenar por puntos Fantasy (puntos VPG) descendente
        enrichedDefenders.sort((a, b) => b.points - a.points);
        
        console.log('--- TOP 10 DEFENSORES POR PUNTOS FANTASY ---');
        enrichedDefenders.slice(0, 10).forEach((d, index) => {
            console.log(`${index + 1}. ${d.eaPlayerName} (${d.lastClub || 'Sin Club'} - ${d.position}) | Puntos: ${d.points} | PJ: ${d.matchesPlayed} | Goles: ${d.goals} | Porterías a Cero: ${d.cleanSheets} | Rating: ${d.avgRating.toFixed(2)} | Valor: ${d.price.toLocaleString('es-ES')} €`);
        });
        
        // 2. Ordenar por valoración media descendente (mínimo 5 partidos)
        const sortedByRating = enrichedDefenders.filter(d => d.matchesPlayed >= 5);
        sortedByRating.sort((a, b) => b.avgRating - a.avgRating);
        
        console.log('\n--- TOP 10 DEFENSORES POR VALORACIÓN MEDIA (Mín. 5 partidos) ---');
        sortedByRating.slice(0, 10).forEach((d, index) => {
            console.log(`${index + 1}. ${d.eaPlayerName} (${d.lastClub || 'Sin Club'} - ${d.position}) | Rating: ${d.avgRating.toFixed(2)} | PJ: ${d.matchesPlayed} | Puntos: ${d.points} | Valor: ${d.price.toLocaleString('es-ES')} €`);
        });
        
        // 3. Buscar a nuestro jugador para ver su posición relativa
        const unaiIndexPoints = enrichedDefenders.findIndex(d => d.eaPlayerName.toLowerCase() === 'unaiiigarciiiaa_');
        const unaiIndexRating = sortedByRating.findIndex(d => d.eaPlayerName.toLowerCase() === 'unaiiigarciiiaa_');
        
        console.log('\n--- POSICIÓN RELATIVA DE unaiiigarciiiaa_ ---');
        console.log(`Puesto por puntos: ${unaiIndexPoints + 1} de ${enrichedDefenders.length}`);
        console.log(`Puesto por valoración media (mín. 5 PJ): ${unaiIndexRating + 1} de ${sortedByRating.length}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
