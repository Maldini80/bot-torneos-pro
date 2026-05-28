import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const teamIds = [
            "6a10b2d9f7eee658f4490893", // jam esports
            "6a11ac02f2f3fd97f4bebaac", // ISLANDIA
            "6a135d7295bac5e6a15a781f", // Cryzen gaming
            "6a13691295bac5e6a15a7835", // IMPERIO GITANO
            "6a1472fa401a56cf66dbad91", // ADCEUTA ESPORTS
            "6a1495ed081e5b79d9a94758"  // UD Las Palmas
        ];
        
        console.log("=== Checking Team points and balances ===");
        for (const id of teamIds) {
            const team = await db.collection('fantasy_teams').findOne({ _id: new ObjectId(id) });
            if (team) {
                console.log(`Team: ${team.teamName || 'N/A'} (ID: ${id})`);
                console.log(` - Points: ${team.points}`);
                console.log(` - Balance: ${team.balance}`);
            } else {
                console.log(`Team with ID ${id} not found.`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
