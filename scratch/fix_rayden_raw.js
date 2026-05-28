import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    const playerColl = db.collection('player_profiles');

    const playerName = "zzRaydenzz";
    const profile = await playerColl.findOne({ eaPlayerName: /zzraydenzz/i });

    if (profile) {
        console.log("Current profile stats:", profile.stats);
        
        // Initialize vpgLastRaw to baseline before today's match: 19.9 points and 2 matches
        const vpgLastRaw = {
            matchesPlayed: 2,
            goals: 0,
            assists: 0,
            shots: 0,
            saves: 0,
            redCards: 0,
            yellowCards: 0,
            cleanSheets: 0,
            wins: 1,
            losses: 1,
            ties: 0,
            vpgPoints: 19.9
        };

        console.log("Setting vpgLastRaw to:", vpgLastRaw);
        
        await playerColl.updateOne(
            { _id: profile._id },
            { 
                $set: { 
                    "stats.vpgLastRaw": vpgLastRaw
                } 
            }
        );
        
        console.log("Profile successfully updated!");
    } else {
        console.error("zzRaydenzz profile not found!");
    }

    process.exit(0);
}

run().catch(console.error);
