// scratch/check_missing_superliga_teams.js
import { connectDb, getDb } from '../database.js';
import 'dotenv/config';

const SUPERLIGA_TEAMS = [
    "GMK Villarreal CF", "AD CEUTA ESPORTS", "SUZAKU ESPORTS", "ZENTURIONS", "ALPHA WOLFS", "Tempus Esports", "90min FC", "LTK ESPORTS", "JAM ESPORTS", "CRYZEN GAMING", "VentuCorp", "BANANO ESPORTS", "JS ELCANO", "CE EUROPA ESPORTS",
    "Oxygen Levante", "DriFt Esports", "CEUTA GUARDIANS", "CADIZ CF ESPORTS", "Espartanos CF", "TRANSFORMERS CF", "GUINEA PINK", "SHIVA ESPORTS", "RYUX CLAN", "FC MAYANGO", "THUNDER GAMING", "Columbus Pacers", "BACHATEROS FC", "FCP ESPORTS"
];

async function main() {
    await connectDb();
    const db = getDb();
    
    console.log('\n--- Checking SUPERLIGA_TEAMS against club_profiles ---');
    const matched = [];
    const missing = [];

    for (const teamName of SUPERLIGA_TEAMS) {
        // Try exact match case-insensitive or regex
        const regex = new RegExp('^' + teamName.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i');
        const profile = await db.collection('club_profiles').findOne({ eaClubName: { $regex: regex } });
        
        if (profile) {
            matched.push({
                configuredName: teamName,
                dbName: profile.eaClubName,
                eaClubId: profile.eaClubId
            });
        } else {
            // Try a looser match (sub-string)
            const looseRegex = new RegExp(teamName.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
            const looseProfile = await db.collection('club_profiles').findOne({ eaClubName: { $regex: looseRegex } });
            if (looseProfile) {
                matched.push({
                    configuredName: teamName,
                    dbName: looseProfile.eaClubName,
                    eaClubId: looseProfile.eaClubId,
                    loose: true
                });
            } else {
                missing.push(teamName);
            }
        }
    }

    console.log(`\nMatched teams (${matched.length}):`);
    matched.forEach(m => {
        console.log(`- ${m.configuredName} -> DB: "${m.dbName}" | ClubID: ${m.eaClubId}${m.loose ? ' (LOOSE MATCH)' : ''}`);
    });

    console.log(`\nMissing teams in club_profiles (${missing.length}):`);
    missing.forEach(m => {
        console.log(`- ${m}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
