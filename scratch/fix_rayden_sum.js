import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        // 1. Ensure Rayden player profile stats are correct
        const playerColl = db.collection('player_profiles');
        const rayden = await playerColl.findOne({ eaPlayerName: /zzraydenzz/i });
        if (rayden) {
            console.log(`Rayden profile currently has: vpgPoints = ${rayden.stats?.vpgPoints}, matchesPlayed = ${rayden.stats?.matchesPlayed}`);
            if (rayden.stats?.vpgPoints !== 75.1 || rayden.stats?.matchesPlayed !== 6) {
                console.log("Updating Rayden profile stats to: vpgPoints = 75.1, matchesPlayed = 6");
                await playerColl.updateOne(
                    { _id: rayden._id },
                    { 
                        $set: { 
                            "stats.vpgPoints": 75.1,
                            "stats.matchesPlayed": 6
                        } 
                    }
                );
            }
        } else {
            console.warn("Rayden profile not found!");
        }

        // 2. Update basePoints in the 5 zero-mode leagues
        const leagueIds = [
            "6a10abe66bb40cd90498cca8",
            "6a11a866f2f3fd97f4bebaa2",
            "6a12b9de0e3fb8a695696e81",
            "6a1104f781beb9b56df55c19",
            "6a145946ae60292863d37d2e"
        ];

        console.log("\n=== Updating basePoints in Leagues ===");
        for (const id of leagueIds) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(id) });
            if (league) {
                const basePointsMap = league.basePoints || {};
                
                // Clean any case variants of zzraydenzz, and set "zzRaydenzz" to 1.0
                const updatedBasePoints = { ...basePointsMap };
                
                // Delete existing variants
                Object.keys(updatedBasePoints).forEach(key => {
                    if (key.toLowerCase() === 'zzraydenzz') {
                        delete updatedBasePoints[key];
                    }
                });
                
                // Set correct key
                updatedBasePoints["zzRaydenzz"] = 1.0;
                
                await db.collection('fantasy_leagues').updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { basePoints: updatedBasePoints } }
                );
                
                console.log(`Updated basePoints.zzRaydenzz to 1.0 in league "${league.name}" (ID: ${id})`);
            } else {
                console.warn(`League ID: ${id} not found.`);
            }
        }

        console.log("\nUpdate completed successfully!");
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
