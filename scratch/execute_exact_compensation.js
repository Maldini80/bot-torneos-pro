import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== 1. DESHACIENDO LA COMPENSACIÓN PLANA DE ANTES ===\n');
        
        const teams = await db.collection('fantasy_teams').find({}).toArray();
        let revertCount = 0;
        
        for (const t of teams) {
            const starters = {};
            const lineup = t.lineup || {};
            if (lineup.POR) starters[lineup.POR.toLowerCase()] = true;
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && (starters[p.toLowerCase()] = true));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && (starters[p.toLowerCase()] = true));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && (starters[p.toLowerCase()] = true));
            
            const numStarters = Object.keys(starters).length;
            if (numStarters < 11 && t.players && t.players.length > 0 && numStarters > 0) {
                // Calculate what we added in the previous average compensation
                const prevCompPoints = Math.round(numStarters * 16.05 * 10) / 10;
                const prevCompCoins = prevCompPoints * 80000;
                
                await db.collection('fantasy_teams').updateOne(
                    { _id: t._id },
                    {
                        $inc: {
                            points: -prevCompPoints,
                            balance: -prevCompCoins
                        }
                    }
                );
                revertCount++;
            }
        }
        
        // Remove compensation news entries
        const deleteNewsRes = await db.collection('fantasy_news').deleteMany({
            type: 'reward',
            message: { $regex: /^💰 \*\*COMPENSACIÓN\*\*/ }
        });
        
        console.log(`Revertidos ${revertCount} equipos.`);
        console.log(`Eliminados ${deleteNewsRes.deletedCount} registros de noticias de compensación plana.`);
        
        console.log('\n=== 2. PARSEANDO DELTAS DE JUGADORES DESDE LA SIMULACIÓN ===\n');
        
        const simText = fs.readFileSync('scratch/resultado_simulacion.txt', 'utf-8');
        const playerDeltas = new Map();
        
        const lines = simText.split('\n');
        for (const line of lines) {
            // Global list pattern
            const matchGlobal = line.match(/^\d+\.\s+(.*?)\s+\([^)]+\):\s+anterior:\s+[\d.]+\s+pts\s+-\u003e\s+actual:\s+[\d.]+\s+pts\s+\(Delta:\s+\+([\d.]+)\s+pts\)/i);
            if (matchGlobal) {
                const name = matchGlobal[1].toLowerCase().trim();
                const delta = parseFloat(matchGlobal[2]);
                playerDeltas.set(name, delta);
            }
            
            // Contribution pattern
            if (line.includes('Jugadores que aportaron:')) {
                const content = line.split('Jugadores que aportaron:')[1].trim();
                const parts = content.split(',');
                for (const part of parts) {
                    const subParts = part.split('(');
                    if (subParts.length >= 2) {
                        const name = subParts[0].trim().toLowerCase();
                        const deltaMatch = subParts[1].match(/\+([\d.]+)\s+pts/);
                        if (deltaMatch) {
                            const delta = parseFloat(deltaMatch[1]);
                            if (!playerDeltas.has(name) || playerDeltas.get(name) < delta) {
                                playerDeltas.set(name, delta);
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`Cargados deltas para ${playerDeltas.size} jugadores.`);
        
        console.log('\n=== 3. CALCULANDO Y APLICANDO PUNTOS EXACTOS JUGADOR POR JUGADOR ===\n');
        
        let processedCount = 0;
        let totalExactPointsAdded = 0;
        let totalExactCoinsAdded = 0;
        
        for (const t of teams) {
            const starters = [];
            const lineup = t.lineup || {};
            if (lineup.POR) starters.push(lineup.POR);
            if (Array.isArray(lineup.DFC)) lineup.DFC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.MC)) lineup.MC.forEach(p => p && starters.push(p));
            if (Array.isArray(lineup.DC)) lineup.DC.forEach(p => p && starters.push(p));
            
            const numStarters = starters.length;
            if (numStarters < 11 && t.players && t.players.length > 0 && numStarters > 0) {
                let teamDeltaPoints = 0;
                const breakdown = [];
                
                for (const pName of starters) {
                    const pDelta = playerDeltas.get(pName.toLowerCase()) || 0;
                    if (pDelta > 0) {
                        teamDeltaPoints += pDelta;
                        breakdown.push(`${pName} (+${pDelta} pts)`);
                    }
                }
                
                teamDeltaPoints = Math.round(teamDeltaPoints * 10) / 10;
                
                if (teamDeltaPoints > 0) {
                    processedCount++;
                    const coinsReward = teamDeltaPoints * 80000;
                    
                    totalExactPointsAdded += teamDeltaPoints;
                    totalExactCoinsAdded += coinsReward;
                    
                    // 1. Update points and balance in DB
                    await db.collection('fantasy_teams').updateOne(
                        { _id: t._id },
                        {
                            $inc: {
                                points: teamDeltaPoints,
                                balance: coinsReward
                            }
                        }
                    );
                    
                    // 2. Log news entry
                    const newsMsg = `💰 **RECOMPENSA JORNADA**: El equipo **${t.teamName}** recibe **${coinsReward.toLocaleString('es-ES')} €** por obtener **${teamDeltaPoints}** puntos reales de sus titulares. Contribuciones: ${breakdown.join(', ')}.`;
                    
                    await db.collection('fantasy_news').insertOne({
                        leagueId: t.leagueId,
                        type: 'reward',
                        message: newsMsg,
                        metadata: {
                            teamName: t.teamName,
                            discordId: t.discordId,
                            points: teamDeltaPoints,
                            reward: coinsReward,
                            timestamp: new Date().toISOString()
                        },
                        createdAt: new Date()
                    });
                    
                    console.log(`[OK] ${t.teamName} (${t.discordUsername}): +${teamDeltaPoints} pts, +${coinsReward.toLocaleString()} € | Breakdown: ${breakdown.join(', ')}`);
                } else {
                    console.log(`[SKIP] ${t.teamName} (${t.discordUsername}): 0 pts anotados por sus ${numStarters} titulares.`);
                }
            }
        }
        
        console.log(`\n=== PROCESO FINALIZADO ===`);
        console.log(`Equipos que sumaron puntos reales: ${processedCount}`);
        console.log(`Total puntos exactos repartidos: ${totalExactPointsAdded.toFixed(1)} pts`);
        console.log(`Total dinero exacto repartido: ${totalExactCoinsAdded.toLocaleString('es-ES')} €`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
