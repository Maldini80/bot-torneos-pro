import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const LEAGUE_NAMES = ["2 DIVISION VPG", "RUDOS CD", "Vike Calvo", "Liga MAGIC"];

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== DETALLES DE LAS LIGAS ===\n');
        
        for (const lName of LEAGUE_NAMES) {
            const league = await db.collection('fantasy_leagues').findOne({ name: lName });
            if (!league) {
                console.log(`Liga "${lName}" no encontrada.`);
                continue;
            }
            
            console.log(`Liga: "${lName}" (ID: ${league._id})`);
            console.log(`  - Points Mode: ${league.pointsMode}`);
            console.log(`  - Created At: ${league.createdAt ? (league.createdAt.toISOString ? league.createdAt.toISOString() : league.createdAt) : 'N/A'}`);
            console.log(`  - Status: ${league.status}`);
            console.log(`  - Base Points Map keys count: ${league.basePoints ? Object.keys(league.basePoints).length : 0}`);
            
            // Find teams in this league
            const teams = await db.collection('fantasy_teams').find({ leagueId: String(league._id) }).toArray();
            console.log(`  - Teams (${teams.length}):`);
            teams.forEach(t => {
                console.log(`    * ${t.teamName || t.name} (Owner: ${t.discordId})`);
            });
            console.log('---------------------------------------------------\n');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
