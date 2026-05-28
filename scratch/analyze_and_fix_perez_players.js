import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const PLAYERS_DATA = [
    {
        name: "Adrianbr03",
        activePoints: 36.4,
        activeMatches: 2,
        inactivePoints: 188.2,
        inactiveMatches: 14,
        // Reset happened during VPG matches yesterday night (May 26).
        // Matches finished around 23:45 Europe/Madrid on May 26.
        // So we set the reset date to 2026-05-26T22:30:00Z (23:30:00 Madrid time).
        resetTime: new Date("2026-05-26T21:30:00Z"), 
        vpgTeamSlug: "rysix-gaming",
        vpgLeagueSlug: "segunda-division-a-spain",
    },
    {
        name: "eric0055k",
        activePoints: 160.7,
        activeMatches: 12,
        inactivePoints: 179.8,
        inactiveMatches: 14,
        // Reset happened earlier. His last active matches before today were on May 25.
        // We set the reset date to 2026-05-25T21:59:00Z (23:59 Madrid time).
        resetTime: new Date("2026-05-25T21:59:00Z"),
        vpgTeamSlug: "doom-reapers",
        vpgLeagueSlug: "segunda-division-a-spain",
    },
    {
        name: "Manelibz4_",
        activePoints: 12.8,
        activeMatches: 2,
        inactivePoints: 140.6,
        inactiveMatches: 14,
        // Reset happened during VPG matches yesterday night (May 26).
        // Set the reset date to 2026-05-26T22:30:00Z (23:30:00 Madrid time).
        resetTime: new Date("2026-05-26T21:30:00Z"),
        vpgTeamSlug: "Hercules-CF-sports",
        vpgLeagueSlug: "segunda-division-a-spain",
    }
];

async function run() {
    const isExecute = process.argv.includes('--execute');
    console.log(`============================================================`);
    console.log(`MIGRATION SCRIPT FOR PEREZ FC CONTRACT RESETS (TIME-AWARE)`);
    console.log(`MODE: ${isExecute ? 'LIVE EXECUTION' : 'DRY-RUN (SIMULATION)'}`);
    console.log(`============================================================\n`);

    const client = new MongoClient(process.env.DATABASE_URL);
    
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        const playerColl = db.collection('player_profiles');
        
        for (const data of PLAYERS_DATA) {
            console.log(`👤 Jugador: "${data.name}"`);
            
            const profile = await playerColl.findOne({
                eaPlayerName: { $regex: new RegExp('^' + data.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
            });
            
            if (!profile) {
                console.log(`  ❌ Sin perfil en la base de datos.`);
                console.log('------------------------------------------------------------\n');
                continue;
            }
            
            const expectedPointsSum = Math.round((data.inactivePoints + data.activePoints) * 10) / 10;
            const expectedPJSum = data.inactiveMatches + data.activeMatches;
            const currentDbPoints = profile.stats?.vpgPoints || 0;
            const currentDbPJ = profile.stats?.matchesPlayed || 0;
            
            console.log(`    - Puntos DB Actuales: ${currentDbPoints} | PJ: ${currentDbPJ}`);
            console.log(`    - Nuevos Puntos Consolidados: ${expectedPointsSum} | PJ: ${expectedPJSum}`);
            console.log(`    - Reset VPG estimado: ${data.resetTime.toISOString()}`);
            
            // Check zero leagues basePoints
            const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero', status: { $ne: 'closed' } }).toArray();
            const basePointsUpdates = [];
            
            for (const l of leagues) {
                const basePointsMap = l.basePoints || {};
                const matchKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === data.name.toLowerCase());
                
                if (matchKey !== undefined) {
                    const currentBaseVal = basePointsMap[matchKey];
                    const leagueCreated = l.createdAt ? new Date(l.createdAt) : new Date(0);
                    
                    let newBaseVal = currentBaseVal;
                    let action = 'KEEP AS IS';
                    
                    // IF league was created AFTER the player's reset time
                    if (leagueCreated > data.resetTime) {
                        newBaseVal = expectedPointsSum;
                        action = `UPDATE basePoints to ${expectedPointsSum} (League created on ${leagueCreated.toISOString()} is AFTER player reset time)`;
                        basePointsUpdates.push({ leagueId: l._id, leagueName: l.name, key: matchKey, val: newBaseVal });
                    } else {
                        const netDiff = Math.round((expectedPointsSum - currentBaseVal) * 10) / 10;
                        action = `KEEP ${currentBaseVal} (League created on ${leagueCreated.toISOString()} is BEFORE player reset time, net delta will gain +${netDiff} pts)`;
                    }
                    
                    console.log(`    * Liga "${l.name}": Current: ${currentBaseVal} | Decision: ${action}`);
                }
            }
            
            if (isExecute) {
                // Update player profile
                await playerColl.updateOne(
                    { _id: profile._id },
                    { 
                        $set: { 
                            "stats.vpgPoints": expectedPointsSum,
                            "stats.matchesPlayed": expectedPJSum,
                            "stats.vpgLastRaw": {
                                matchesPlayed: data.activeMatches,
                                vpgPoints: data.activePoints,
                                goals: 0,
                                assists: 0,
                                shots: 0,
                                saves: 0,
                                redCards: 0,
                                yellowCards: 0,
                                cleanSheets: 0,
                                wins: 0,
                                losses: 0,
                                ties: 0
                            }
                        } 
                    }
                );
                
                // Update zero leagues basePoints
                for (const bpUp of basePointsUpdates) {
                    await db.collection('fantasy_leagues').updateOne(
                        { _id: bpUp.leagueId },
                        { $set: { [`basePoints.${bpUp.key}`]: bpUp.val } }
                    );
                }
                console.log(`    ✅ Base de datos actualizada con éxito para ${data.name}.`);
            }
            console.log('------------------------------------------------------------\n');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
