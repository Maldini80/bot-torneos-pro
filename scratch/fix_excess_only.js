import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';
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
    console.log('Solo muestra equipos donde PUNTOS ACTUALES > PUNTOS RECALCULADOS');
    console.log('(= el exceso que viene del bug)\n');
    
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('tournamentBotDb');
    const playerColl = db.collection('player_profiles');
    
    const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero' }).toArray();
    
    let totalFixed = 0;
    const corrections = [];
    
    for (const league of leagues) {
        const leagueId = league._id.toString();
        const basePoints = league.basePoints || {};
        const teams = await db.collection('fantasy_teams').find({ leagueId, approved: true }).toArray();
        
        for (const team of teams) {
            const starters = getLineupPlayers(team.lineup);
            if (starters.length < 11) continue;
            
            let recalculatedPoints = 0;
            const playerDetails = [];
            
            for (const playerName of starters) {
                const player = await playerColl.findOne({
                    eaPlayerName: { $regex: new RegExp('^' + playerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
                });
                if (!player) continue;
                
                const { points: rawPoints } = calculatePlayerPointsAndPrice(player);
                
                let base = undefined;
                if (basePoints[player.eaPlayerName] !== undefined) {
                    base = basePoints[player.eaPlayerName];
                } else {
                    const foundKey = Object.keys(basePoints).find(k => k.toLowerCase() === player.eaPlayerName.toLowerCase());
                    if (foundKey !== undefined) base = basePoints[foundKey];
                }
                if (base === undefined) base = rawPoints;
                
                const contribution = Math.max(0, Math.round((rawPoints - base) * 10) / 10);
                recalculatedPoints += contribution;
                playerDetails.push({ name: player.eaPlayerName, contribution });
            }
            
            recalculatedPoints = Math.round(recalculatedPoints * 10) / 10;
            const currentPts = Math.round((team.points || 0) * 10) / 10;
            const excess = Math.round((currentPts - recalculatedPoints) * 10) / 10;
            
            // Solo mostrar si el equipo tiene MÁS puntos que el recalculado
            if (excess > 0.5) {
                totalFixed++;
                corrections.push({
                    leagueName: league.name,
                    teamId: team._id,
                    teamName: team.teamName,
                    currentPts,
                    recalculatedPoints,
                    excess
                });
                
                console.log(`📋 ${league.name} | 👤 ${team.teamName}`);
                console.log(`   Puntos actuales:      ${currentPts}`);
                console.log(`   Máximo correcto:      ${recalculatedPoints}`);
                console.log(`   EXCESO (del bug):     +${excess} pts`);
                console.log(`   → Corregir a:         ${recalculatedPoints}`);
                console.log('');
            }
        }
    }
    
    console.log(`${'='.repeat(60)}`);
    console.log(`Equipos con puntos de más (afectados por el bug): ${totalFixed}`);
    console.log('='.repeat(60));
    
    if (!DRY_RUN && corrections.length > 0) {
        console.log('\nAplicando correcciones...\n');
        for (const c of corrections) {
            await db.collection('fantasy_teams').updateOne(
                { _id: c.teamId },
                { $set: { points: c.recalculatedPoints } }
            );
            console.log(`✅ ${c.teamName} (${c.leagueName}): ${c.currentPts} → ${c.recalculatedPoints}`);
        }
    }
    
    await client.close();
}

main().catch(console.error);
