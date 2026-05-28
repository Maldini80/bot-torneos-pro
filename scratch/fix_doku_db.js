// scratch/fix_doku_db.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('Updating xDoku_11 in player_profiles to clean and correct stats...');
    
    const correctStats = {
        matchesPlayed: 14,
        goals: 4,
        assists: 1,
        passesMade: 0,
        passesAttempted: 0,
        tacklesMade: 0,
        tacklesAttempted: 0,
        shots: 5,
        shotsOnTarget: 0,
        interceptions: 0,
        saves: 0,
        redCards: 0,
        yellowCards: 0,
        mom: 0,
        cleanSheets: 0,
        goalsConceded: 0,
        ratings: [
          6.65,
          6.65,
          6.05,
          6.05,
          6.05,
          6.05
        ],
        wins: 7,
        losses: 6,
        ties: 3,
        vpgPoints: 157.5,
        vpgLastRaw: {
          matchesPlayed: 4,
          goals: 1,
          assists: 0,
          shots: 0,
          saves: 0,
          redCards: 0,
          yellowCards: 0,
          cleanSheets: 0,
          wins: 3,
          losses: 1,
          ties: 1,
          vpgPoints: 46.3
        },
        vpgLastRawPerLeague: {
          "superliga-spain-a": {
            matchesPlayed: 10,
            goals: 3,
            assists: 1,
            vpgPoints: 111.2
          },
          "superliga-spain-b": {
            matchesPlayed: 4,
            goals: 1,
            assists: 0,
            vpgPoints: 46.3
          }
        }
    };

    const result = await db.collection('player_profiles').updateOne(
        { eaPlayerName: "xDoku_11" },
        { 
            $set: { 
                stats: correctStats,
                vpgTeamSlug: "ceuta-guardians",
                vpgLeagueSlug: "superliga-spain-b",
                lastClub: "CEUTA GUARDIANS"
            } 
        }
    );
    
    console.log(`Update result:`, result);

    // Verify after fix
    const player = await db.collection('player_profiles').findOne({ eaPlayerName: "xDoku_11" });
    console.log(`\nVerified player profile in DB after fix:`, JSON.stringify(player, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
