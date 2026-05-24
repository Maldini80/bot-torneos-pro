import { getDb, connectDb } from '../database.js';

async function investigate() {
    await connectDb();
    const db = getDb();
    
    console.log("--- Búsqueda de kilianeltete19 en player_profiles ---");
    const playerColl = db.collection('player_profiles');
    const player = await playerColl.findOne({ eaPlayerName: /kilianeltete19/i });
    console.log("Player Profile:", JSON.stringify(player, null, 2));

    console.log("\n--- Búsqueda de ligas de fantasy ---");
    const leagueColl = db.collection('fantasy_leagues');
    const leagues = await leagueColl.find().toArray();
    for (const league of leagues) {
        console.log(`Liga: ${league.name} (${league._id})`);
        console.log(`  pointsMode: ${league.pointsMode}`);
        
        let baseVal = undefined;
        if (league.basePoints) {
            baseVal = league.basePoints[player.eaPlayerName];
            if (baseVal === undefined) {
                // Try case insensitive find
                const foundKey = Object.keys(league.basePoints).find(k => k.toLowerCase() === player.eaPlayerName.toLowerCase());
                if (foundKey) {
                    baseVal = league.basePoints[foundKey];
                }
            }
        }
        console.log(`  basePoints for kilianeltete19: ${baseVal}`);
    }

    process.exit(0);
}

investigate().catch(console.error);
