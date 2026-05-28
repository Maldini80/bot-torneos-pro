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
        vpgTeamSlug: "rysix-gaming",
        vpgLeagueSlug: "segunda-division-a-spain",
        lastClub: "RYSIX GAMING"
    },
    {
        name: "eric0055k",
        activePoints: 160.7,
        activeMatches: 12,
        inactivePoints: 179.8,
        inactiveMatches: 14,
        vpgTeamSlug: "doom-reapers",
        vpgLeagueSlug: "segunda-division-a-spain",
        lastClub: "DOOM REAPERS"
    },
    {
        name: "Manelibz4_",
        activePoints: 12.8,
        activeMatches: 2,
        inactivePoints: 140.6,
        inactiveMatches: 14,
        vpgTeamSlug: "Hercules-CF-sports",
        vpgLeagueSlug: "segunda-division-a-spain",
        lastClub: "HÉRCULES CF SPORTS"
    }
];

async function run() {
    const isExecute = process.argv.includes('--execute');
    console.log(`========================================`);
    console.log(`MIGRATION SCRIPT FOR PEREZ FC CONTRACT RESETS`);
    console.log(`MODE: ${isExecute ? 'LIVE EXECUTION' : 'DRY-RUN (SIMULATION)'}`);
    console.log(`========================================\n`);

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
                continue;
            }
            
            const expectedPointsSum = data.inactivePoints + data.activePoints;
            const expectedPJSum = data.inactiveMatches + data.activeMatches;
            const currentDbPoints = profile.stats?.vpgPoints || 0;
            const currentDbPJ = profile.stats?.matchesPlayed || 0;
            
            console.log(`    - Puntos DB Actuales: ${currentDbPoints} | PJ: ${currentDbPJ}`);
            console.log(`    - Nuevos Puntos Consolidados: ${expectedPointsSum} | PJ: ${expectedPJSum}`);
            
            // Check zero leagues basePoints
            const leagues = await db.collection('fantasy_leagues').find({ pointsMode: 'zero', status: { $ne: 'closed' } }).toArray();
            const basePointsUpdates = [];
            
            for (const l of leagues) {
                const basePointsMap = l.basePoints || {};
                const matchKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === data.name.toLowerCase());
                
                if (matchKey !== undefined) {
                    const currentBaseVal = basePointsMap[matchKey];
                    const diffToActive = Math.abs(currentBaseVal - data.activePoints);
                    
                    let newBaseVal = currentBaseVal;
                    let action = 'KEEP AS IS';
                    
                    // If basePoints is close to activePoints (meaning league started after their reset)
                    if (diffToActive <= 3) {
                        newBaseVal = expectedPointsSum;
                        action = `UPDATE to ${expectedPointsSum} (League started AFTER contract reset)`;
                        basePointsUpdates.push({ leagueId: l._id, leagueName: l.name, key: matchKey, val: newBaseVal });
                    } else {
                        action = `KEEP ${currentBaseVal} (League started BEFORE contract reset, player will gain ${expectedPointsSum - currentBaseVal} net pts)`;
                    }
                    
                    console.log(`    League "${l.name}" basePoints [${matchKey}]: Current: ${currentBaseVal} | Decision: ${action}`);
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
