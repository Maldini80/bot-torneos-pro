// scratch/inspect_player_prices.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

const SUPERLIGA_TEAMS = [
    "GMK Villarreal CF eSports", "AD Ceuta eSports", "Suzaku esports", "Zenturions", "Alpha Wolfs", "Tempus eSports", "90min FC", "LTK eSports", "Jam eSports", "Cryzen Gaming", "Ventucorp eSports", "Banano eSports", "JS ELCANO", "CE Europa eSports",
    "Oxygen Levante", "DriFt Esports", "Ceuta Guardians", "Cadiz Esports", "Espartanos CF", "Transformers CF", "GUINEA PINK", "Shiva esports", "RYUX CLAN", "FC Mayango", "Black Hawks", "Columbus Pacers", "Bachateros FC", "FCP eSports"
];

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Inspecting Player Profiles & Manual Prices ---');
    
    const totalCount = await db.collection('player_profiles').countDocuments({});
    const manualPriceCount = await db.collection('player_profiles').countDocuments({ manualPrice: { $ne: null } });
    
    const superligaRegexes = SUPERLIGA_TEAMS.map(name => new RegExp('^' + name.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i'));
    
    const superligaCount = await db.collection('player_profiles').countDocuments({ lastClub: { $in: superligaRegexes } });
    const nonSuperligaCount = await db.collection('player_profiles').countDocuments({ lastClub: { $nin: superligaRegexes } });
    
    console.log(`Total Player Profiles: ${totalCount}`);
    console.log(`Players with manualPrice set: ${manualPriceCount}`);
    console.log(`Players in Superliga teams: ${superligaCount}`);
    console.log(`Players in non-Superliga teams: ${nonSuperligaCount}`);

    if (manualPriceCount > 0) {
        console.log('\nSample players with manualPrice:');
        const manualPlayers = await db.collection('player_profiles').find({ manualPrice: { $ne: null } }).toArray();
        manualPlayers.forEach(p => {
            console.log(`- ${p.eaPlayerName} | Club: ${p.lastClub} | manualPrice: ${p.manualPrice}`);
        });
    }

    // Inspect clubs
    const totalClubs = await db.collection('club_profiles').countDocuments({});
    const superligaClubs = await db.collection('club_profiles').countDocuments({ eaClubName: { $in: superligaRegexes } });
    const nonSuperligaClubs = await db.collection('club_profiles').countDocuments({ eaClubName: { $nin: superligaRegexes } });
    console.log(`\nTotal Club Profiles: ${totalClubs}`);
    console.log(`Clubs in Superliga teams: ${superligaClubs}`);
    console.log(`Clubs in non-Superliga teams: ${nonSuperligaClubs}`);

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

