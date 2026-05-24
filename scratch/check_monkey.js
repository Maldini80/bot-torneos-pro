import { connectDb, getDb } from '../database.js';
import { ObjectId } from 'mongodb';

async function main() {
    await connectDb();
    const db = getDb();
    
    const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId('6a0f8c20ae3aed564b3915a4') });
    if (league && league.basePoints) {
        console.log("League found! PointsMode:", league.pointsMode);
        const value = league.basePoints['MonKeyDFFYLU'];
        console.log("basePoints['MonKeyDFFYLU']:", value);
        // Find keys matching case insensitively
        const keys = Object.keys(league.basePoints);
        const match = keys.find(k => k.toLowerCase() === 'monkeydffylu');
        console.log("Matching key case-insensitive:", match);
        console.log("Value:", league.basePoints[match]);
    } else {
        console.log("No league basePoints found or league not found.");
    }
    process.exit(0);
}

main().catch(console.error);
