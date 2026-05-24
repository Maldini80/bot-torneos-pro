// scratch/compare_superliga_teams.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const SUPERLIGA_TEAMS = [
    "GMK Villarreal CF", "AD CEUTA ESPORTS", "SUZAKU ESPORTS", "ZENTURIONS", "ALPHA WOLFS", "Tempus Esports", "90min FC", "LTK ESPORTS", "JAM ESPORTS", "CRYZEN GAMING", "VentuCorp", "BANANO ESPORTS", "JS ELCANO", "CE EUROPA ESPORTS",
    "Oxygen Levante", "DriFt Esports", "CEUTA GUARDIANS", "CADIZ CF ESPORTS", "Espartanos CF", "TRANSFORMERS CF", "GUINEA PINK", "SHIVA ESPORTS", "RYUX CLAN", "FC MAYANGO", "THUNDER GAMING", "Columbus Pacers", "BACHATEROS FC", "FCP ESPORTS"
];

async function main() {
    const client = new MongoClient(process.env.DATABASE_URL);
    await client.connect();
    const db = client.db('test');
    
    console.log('\n--- Comparing SUPERLIGA_TEAMS with test.teams ---');
    const teams = await db.collection('teams').find({}).toArray();

    const unmatched = [];
    
    for (const configuredName of SUPERLIGA_TEAMS) {
        // Try to find a match in test.teams
        const match = teams.find(t => {
            const n1 = t.name.toLowerCase().trim();
            const n2 = configuredName.toLowerCase().trim();
            return n1 === n2 || n1.includes(n2) || n2.includes(n1);
        });

        if (match) {
            console.log(`✅ Config: "${configuredName}" -> Bot Team: "${match.name}" (ClubID: ${match.eaClubId})`);
        } else {
            unmatched.push(configuredName);
        }
    }

    console.log('\n❌ Unmatched Configured Teams (Not found in bot database):');
    unmatched.forEach(name => {
        console.log(`- ${name}`);
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
