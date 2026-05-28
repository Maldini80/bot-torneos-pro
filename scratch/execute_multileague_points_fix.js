// scratch/execute_multileague_points_fix.js
import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

const DRY_RUN = false; // Set to false to apply changes to database

async function main() {
    await connectDb();
    const db = getDb();

    console.log(`[FIX] Starting points correction for multi-league baseline duplication... (DRY_RUN = ${DRY_RUN})`);

    // 1. Correct ZeROzeraa profile stats.vpgPoints
    const zerozeraa = await db.collection('player_profiles').findOne({ eaPlayerName: 'ZeROzeraa' });
    if (zerozeraa) {
        const oldPoints = zerozeraa.stats.vpgPoints;
        const newPoints = 346.1; // 582.6 - 236.5
        console.log(`[FIX] ZeROzeraa stats.vpgPoints: ${oldPoints} -> ${newPoints}`);
        if (!DRY_RUN) {
            await db.collection('player_profiles').updateOne(
                { _id: zerozeraa._id },
                { $set: { "stats.vpgPoints": newPoints } }
            );
        }
    }

    // 2. Correct not_ven00m profile stats.vpgPoints
    const venom = await db.collection('player_profiles').findOne({ eaPlayerName: 'not_ven00m' });
    if (venom) {
        const oldPoints = venom.stats.vpgPoints;
        const newPoints = 121.4; // 242.8 - 121.4
        console.log(`[FIX] not_ven00m stats.vpgPoints: ${oldPoints} -> ${newPoints}`);
        if (!DRY_RUN) {
            await db.collection('player_profiles').updateOne(
                { _id: venom._id },
                { $set: { "stats.vpgPoints": newPoints } }
            );
        }
    }

    // 3. Find today's duplicate history docs at sync2 (createdAt approx 13:29 - 13:33)
    const today = new Date('2026-05-28T00:00:00.000Z');
    const historyDocs = await db.collection('fantasy_player_history').find({
        playerName: { $in: ['ZeROzeraa', 'not_ven00m'] },
        createdAt: { $gte: today }
    }).toArray();

    // Filter to get the duplicate sync run docs
    const dupDocs = historyDocs.filter(h => h.createdAt.toISOString().includes('T13:'));
    console.log(`[FIX] Found ${dupDocs.length} duplicate history records from today's second sync run to clean up.`);

    // 4. Clean up team points and news for each duplicate doc
    for (const doc of dupDocs) {
        const leagueId = doc.leagueId;
        const teamIdStr = doc.teamId;
        const ptsToSubtract = doc.points;
        const playerName = doc.playerName;
        const wasStarter = doc.wasStarter;

        console.log(`[FIX] Processing doc: Player "${playerName}" | League ID: "${leagueId}" | Team ID: "${teamIdStr}" | Points: ${ptsToSubtract} | wasStarter: ${wasStarter}`);

        if (wasStarter && ptsToSubtract > 0) {
            // Find team
            const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(teamIdStr) });
            if (team) {
                const oldTeamPoints = team.points || 0;
                const newTeamPoints = Math.max(0, Math.round((oldTeamPoints - ptsToSubtract) * 10) / 10);
                console.log(`  -> Team "${team.teamName}" points: ${oldTeamPoints} -> ${newTeamPoints}`);
                
                if (!DRY_RUN) {
                    // Update team points
                    await db.collection('fantasy_teams').updateOne(
                        { _id: team._id },
                        { $set: { points: newTeamPoints } }
                    );

                    // Add correction news
                    try {
                        const { logFantasyNews } = await import('../src/utils/fantasyNewsLogger.js');
                        const newsMsg = `🔧 **Corrección de Puntos**: Se ha corregido un error de duplicación de estadísticas en VPG del jugador **${playerName}** (jugaba en dos divisiones simultáneas). Se han restado **${ptsToSubtract} pts** al equipo **${team.teamName}** (Nuevo total: **${newTeamPoints} pts**).`;
                        await logFantasyNews(leagueId, 'admin_action', newsMsg, {
                            teamName: team.teamName,
                            playerName,
                            subtractedPoints: ptsToSubtract,
                            newTotalPoints: newTeamPoints
                        });
                        console.log(`  -> Published news in league: "${leagueId}"`);
                    } catch (newsErr) {
                        console.error('Error logging correction news:', newsErr.message);
                    }
                }
            } else {
                console.log(`  -> WARNING: Team not found for ID: ${teamIdStr}`);
            }
        }

        // Delete the history document
        if (!DRY_RUN) {
            await db.collection('fantasy_player_history').deleteOne({ _id: doc._id });
            console.log(`  -> Deleted duplicate history record ${doc._id}`);
        }
    }

    console.log('[FIX] Completed points correction script execution.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
