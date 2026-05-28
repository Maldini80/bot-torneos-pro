import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

// Importar la función de cálculo de puntos real del proyecto
import { calculatePlayerPointsAndPrice } from '../src/utils/fantasyVpgSync.js';

const uri = process.env.DATABASE_URL;

function getLineupPlayers(lineup) {
    if (!lineup) return [];
    const starters = [];
    if (lineup.POR) starters.push(lineup.POR);
    if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && starters.push(p));
    if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && starters.push(p));
    if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && starters.push(p));
    if (Array.isArray(lineup.CARR)) lineup.CARR.forEach(p => p && starters.push(p));
    return starters;
}

async function main() {
    const DRY_RUN = !process.argv.includes('--execute');
    console.log(DRY_RUN ? '=== MODO DRY RUN ===' : '=== MODO EJECUCIÓN ===');
    console.log('');
    
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    const playerColl = db.collection('player_profiles');
    
    // Obtener todas las ligas zero
    const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
    
    let totalTeamsFixed = 0;
    
    for (const league of leagues) {
        const leagueId = league._id.toString();
        const basePoints = league.basePoints || {};
        
        const teams = await db.collection('fantasy_teams').find({ leagueId, approved: true }).toArray();
        
        for (const team of teams) {
            const starters = getLineupPlayers(team.lineup);
            if (starters.length < 11) continue;
            
            // Recalcular: ¿cuántos puntos DEBERÍA tener este equipo?
            // team.points = sum of (vpgPoints_corrected - basePoints) de cada titular
            let recalculatedPoints = 0;
            const playerDetails = [];
            
            for (const playerName of starters) {
                const player = await playerColl.findOne({
                    eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
                });
                
                if (!player) continue;
                
                const { points: rawPoints } = calculatePlayerPointsAndPrice(player);
                
                // Buscar basePoints
                let base = undefined;
                if (basePoints[player.eaPlayerName] !== undefined) {
                    base = basePoints[player.eaPlayerName];
                } else {
                    const foundKey = Object.keys(basePoints).find(k => k.toLowerCase() === player.eaPlayerName.toLowerCase());
                    if (foundKey !== undefined) {
                        base = basePoints[foundKey];
                    }
                }
                
                if (base === undefined) base = rawPoints; // Si no hay base, no contribuye puntos
                
                const playerPoints = Math.max(0, Math.round((rawPoints - base) * 10) / 10);
                recalculatedPoints += playerPoints;
                
                playerDetails.push({
                    name: player.eaPlayerName,
                    rawPoints: Math.round(rawPoints * 10) / 10,
                    base: Math.round((base || 0) * 10) / 10,
                    contribution: playerPoints
                });
            }
            
            recalculatedPoints = Math.round(recalculatedPoints * 10) / 10;
            const currentPoints = Math.round((team.points || 0) * 10) / 10;
            const diff = Math.round((currentPoints - recalculatedPoints) * 10) / 10;
            
            // Solo mostrar si hay diferencia significativa
            if (Math.abs(diff) > 0.5) {
                totalTeamsFixed++;
                console.log(`📋 ${league.name} | 👤 ${team.teamName}`);
                console.log(`   Puntos actuales:      ${currentPoints}`);
                console.log(`   Puntos recalculados:  ${recalculatedPoints}`);
                console.log(`   Diferencia:           ${diff > 0 ? '+' : ''}${diff} pts`);
                
                // Mostrar detalle de cada titular
                for (const pd of playerDetails) {
                    if (pd.contribution > 0) {
                        console.log(`     ⚽ ${pd.name}: ${pd.rawPoints} - ${pd.base} (base) = ${pd.contribution} pts`);
                    }
                }
                console.log('');
                
                if (!DRY_RUN) {
                    await db.collection('fantasy_teams').updateOne(
                        { _id: team._id },
                        { $set: { points: recalculatedPoints } }
                    );
                    console.log(`   ✅ CORREGIDO: ${currentPoints} → ${recalculatedPoints}\n`);
                }
            }
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Total equipos con diferencia: ${totalTeamsFixed}`);
    console.log('='.repeat(60));
    
    await client.close();
}

main().catch(console.error);
