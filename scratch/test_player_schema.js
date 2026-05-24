import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function checkTeams() {
    const url = process.env.DATABASE_URL;
    const client = new MongoClient(url);
    try {
        await client.connect();
        for (const dbName of ['tournamentBotDb', 'test']) {
            const db = client.db(dbName);
            const count = await db.collection('teams').countDocuments({});
            console.log(`Database: ${dbName} - teams count: ${count}`);
            if (count > 0) {
                const sample = await db.collection('teams').findOne();
                console.log("Sample team name:", sample.name, "eaClubId:", sample.eaClubId, "league:", sample.league);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

checkTeams();
