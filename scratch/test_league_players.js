import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

const SUPERLIGA_TEAMS = [
    "GMK Villarreal CF eSports", "AD Ceuta eSports", "Suzaku esports", "Zenturions", "Alpha Wolfs", "Tempus eSports", "90min FC", "LTK eSports", "Jam eSports", "Cryzen Gaming", "Ventucorp eSports", "Banano eSports", "JS ELCANO", "CE Europa eSports",
    "Oxygen Levante", "DriFt Esports", "Ceuta Guardians", "Cadiz Esports", "Espartanos CF", "Transformers CF", "GUINEA PINK", "Shiva esports", "RYUX CLAN", "FC Mayango", "Black Hawks", "Columbus Pacers", "Bachateros FC", "FCP eSports"
];

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- 1. Testing Superliga Team Filtering ---');
    const allTeams = await getDb('test').collection('teams').find({ eaClubId: { $ne: null } }).toArray();
    const superligaSet = new Set(SUPERLIGA_TEAMS.map(name => name.toLowerCase().trim()));
    const teams = allTeams.filter(t => t.name && superligaSet.has(t.name.toLowerCase().trim()));
    
    console.log(`Total VPG Teams in DB: ${allTeams.length}`);
    console.log(`Filtered Superliga Teams: ${teams.length} / 28`);
    
    if (teams.length !== 28) {
        console.error('❌ Mismatch: Filtered teams count is not 28!');
    } else {
        console.log('✅ Superliga teams count matches 28 perfectly.');
    }

    console.log('\n--- 2. Testing Player Search with Superliga Filter ---');
    const superligaRegexes = SUPERLIGA_TEAMS.map(name => new RegExp('^' + name.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i'));
    
    // We will test search logic with a broad query like "a" or "e" to get matches
    const testQuery = 'e'; 
    const queryObj = {
        lastClub: { $in: superligaRegexes }
    };
    
    const regex = new RegExp(testQuery, 'i');
    queryObj.$or = [
        { eaPlayerName: regex },
        { lastClub: regex }
    ];

    const players = await db.collection('player_profiles').find(queryObj).limit(20).toArray();
    console.log(`Found ${players.length} matching players with query "${testQuery}" and Superliga filter.`);
    
    let allValid = true;
    for (const p of players) {
        const isSuperliga = SUPERLIGA_TEAMS.some(t => t.toLowerCase().trim() === p.lastClub?.toLowerCase().trim());
        if (!isSuperliga) {
            console.error(`❌ Invalid Player found: ${p.eaPlayerName} (Club: ${p.lastClub})`);
            allValid = false;
        } else {
            console.log(`- Valid: ${p.eaPlayerName} | Club: ${p.lastClub}`);
        }
    }
    
    if (allValid && players.length > 0) {
        console.log('✅ All returned players belong to Superliga teams.');
    } else if (players.length === 0) {
        console.log('❓ No players found for this test query.');
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
