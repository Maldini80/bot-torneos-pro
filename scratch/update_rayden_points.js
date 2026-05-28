import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "zzRaydenzz";
        const playerLower = playerName.toLowerCase();
        
        console.log(`1. Resetting basePoints for ${playerName} in all leagues to 0...`);
        const leagues = await db.collection('fantasy_leagues').find({}).toArray();
        let updatedLeagues = 0;
        for (const l of leagues) {
            if (l.basePoints) {
                const basePoints = { ...l.basePoints };
                const foundKey = Object.keys(basePoints).find(k => k.toLowerCase() === playerLower);
                if (foundKey) {
                    basePoints[foundKey] = 0;
                    await db.collection('fantasy_leagues').updateOne(
                        { _id: l._id },
                        { $set: { basePoints } }
                    );
                    updatedLeagues++;
                }
            }
        }
        console.log(`Updated basePoints to 0 in ${updatedLeagues} leagues.`);
        
        console.log(`\n2. Crediting points and rewards to the 6 fantasy teams owning ${playerName}...`);
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^' + playerName + '$', 'i') }
        }).toArray();
        
        const pointsToAward = 19.9;
        const rewardToAward = pointsToAward * 80000; // 1,592,000 €
        
        for (const t of teams) {
            console.log(`Updating Team: "${t.teamName}" (League ID: ${t.leagueId})`);
            await db.collection('fantasy_teams').updateOne(
                { _id: t._id },
                { 
                    $inc: { 
                        points: pointsToAward,
                        balance: rewardToAward
                    } 
                }
            );
            console.log(` -> Credited +${pointsToAward} points and +${rewardToAward.toLocaleString('es-ES')} €.`);
        }
        
        console.log("\nDone! Rayden points correction completed successfully.");
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
