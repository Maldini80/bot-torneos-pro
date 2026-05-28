import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log("=== Reverting updates from task-5231 ===");
        
        // 1. Revert Comunistas FC
        const team1 = await db.collection('fantasy_teams').findOne({ teamName: "Comunistas FC" });
        if (team1) {
            await db.collection('fantasy_teams').updateOne(
                { _id: team1._id },
                {
                    $inc: {
                        points: -19.2,
                        balance: -1536000
                    }
                }
            );
            console.log("Reverted Comunistas FC: -19.2 pts, -1.536.000 €");
        } else {
            console.warn("Comunistas FC not found!");
        }
        
        // 2. Revert Tonitollora
        const team2 = await db.collection('fantasy_teams').findOne({ teamName: "Tonitollora" });
        if (team2) {
            await db.collection('fantasy_teams').updateOne(
                { _id: team2._id },
                {
                    $inc: {
                        points: -221.2,
                        balance: -17696000
                    }
                }
            );
            console.log("Reverted Tonitollora: -221.2 pts, -17.696.000 €");
        } else {
            console.warn("Tonitollora not found!");
        }
        
        console.log("Rollback completed successfully!");
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
