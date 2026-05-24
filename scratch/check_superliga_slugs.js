import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const SUPERLIGA_TEAMS = [
    "GMK Villarreal CF eSports", "AD Ceuta eSports", "Suzaku esports", "Zenturions", "Alpha Wolfs", "Tempus eSports", "90min FC", "LTK eSports", "Jam eSports", "Cryzen Gaming", "Ventucorp eSports", "Banano eSports", "JS ELCANO", "CE Europa eSports",
    "Oxygen Levante", "DriFt Esports", "Ceuta Guardians", "Cadiz Esports", "Espartanos CF", "Transformers CF", "GUINEA PINK", "Shiva esports", "RYUX CLAN", "FC Mayango", "Black Hawks", "Columbus Pacers", "Bachateros FC", "FCP eSports"
];

async function run() {
    const mongoUri = process.env.DATABASE_URL;
    if (!mongoUri) {
        console.error('DATABASE_URL is not set.');
        return;
    }
    const client = new MongoClient(mongoUri);
    try {
        await client.connect();
        const db = client.db('test');
        
        console.log('Checking Superliga teams in DB:');
        for (const name of SUPERLIGA_TEAMS) {
            const team = await db.collection('teams').findOne({ name: { $regex: new RegExp('^' + name.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') } });
            if (team) {
                console.log(`- ${name}: eaClubId=${team.eaClubId}, vpgLeagueSlug=${team.vpgLeagueSlug}`);
            } else {
                console.log(`- ${name}: NOT FOUND in DB`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
