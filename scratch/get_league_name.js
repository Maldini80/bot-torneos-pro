// scratch/get_league_name.js
import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';
import 'dotenv/config';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ 
        _id: new ObjectId("6a1104f781beb9b56df55c19") 
    });
    
    if (league) {
        console.log(`Nombre de la liga: "${league.name}", PointsMode: "${league.pointsMode}"`);
    } else {
        console.log("No encontrada");
    }
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
