import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL || process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log("=== CHECKING FANTASY TEAMS ===");
        const t1 = await db.collection('fantasy_teams').findOne({ _id: new ObjectId("6a15a4980ba0654c6c6877fd") });
        console.log("Team 1:", t1 ? `${t1.name} (Manager: ${t1.managerDiscord || t1.ownerDiscord})` : "Not found");

        const t2 = await db.collection('fantasy_teams').findOne({ _id: new ObjectId("6a18318f0c5c8238752a6c3c") });
        console.log("Team 2:", t2 ? `${t2.name} (Manager: ${t2.managerDiscord || t2.ownerDiscord})` : "Not found");

        const t3 = await db.collection('fantasy_teams').findOne({ _id: new ObjectId("6a15aedd0ba0654c6c687861") });
        console.log("Team 3:", t3 ? `${t3.name} (Manager: ${t3.managerDiscord || t3.ownerDiscord})` : "Not found");

        // Let's also search player_profiles for players who have vpgTeamSlug: "freelynx-ne" or "freelynx-team"
        const freelynxPlayers = await db.collection('player_profiles').find({
            $or: [
                { lastClub: /freelynx/i },
                { vpgTeamSlug: /freelynx/i }
            ]
        }).toArray();
        console.log(`\nFound ${freelynxPlayers.length} players with FreeLynx in profile:`);
        for (const p of freelynxPlayers) {
            console.log(`- Player: ${p.eaPlayerName} | Club: ${p.lastClub} | Slug: ${p.vpgTeamSlug}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
