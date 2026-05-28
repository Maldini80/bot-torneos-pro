import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    
    // Check player profiles
    const profile = await db.collection('player_profiles').findOne({ eaPlayerName: /zzraydenzz/i });
    console.log("=== Player Profile ===");
    console.log(JSON.stringify(profile, null, 2));
    
    // Check vpg_users
    const vpgUser = await db.collection('vpg_users').findOne({ $or: [{ eaId: /zzraydenzz/i }, { psnId: /zzraydenzz/i }] });
    console.log("\n=== VPG User ===");
    console.log(JSON.stringify(vpgUser, null, 2));

    // Check leagues where Rayden is owned
    // Let's search inside fantasy_squads or similar collection to find where this player is owned
    console.log("\n=== Roster Owner (fantasy_squads/squads) ===");
    // Let's find collections first
    const collections = await db.listCollections().toArray();
    const colNames = collections.map(c => c.name);
    console.log("Collections:", colNames);
    
    // Let's search inside all collections that might contain "squad" or "league" or "team"
    if (colNames.includes('fantasy_leagues')) {
        const leagues = await db.collection('fantasy_leagues').find({}).toArray();
        console.log(`\nFound ${leagues.length} fantasy_leagues.`);
        // Let's search for zzraydenzz inside rosters/squads of these leagues.
        // Wait, how are rosters stored? Let's check the schema or query leagues.
        for (const league of leagues) {
            // Let's check if the league document itself has teams or rosters
            // or if there is a fantasy_squads/squads collection.
            if (league.squads) {
                // ...
            }
        }
    }
    
    // Let's search for Rayden's name in all collections that might contain players
    for (const name of colNames) {
        if (name.includes('squad') || name.includes('roster') || name.includes('fantasy_team') || name.includes('team')) {
            const sample = await db.collection(name).findOne({ $or: [{ "players.eaPlayerName": /zzraydenzz/i }, { "players": /zzraydenzz/i }, { "roster": /zzraydenzz/i }] });
            if (sample) {
                console.log(`Found match in collection: ${name}`);
            }
        }
    }

    process.exit(0);
}

run().catch(console.error);
