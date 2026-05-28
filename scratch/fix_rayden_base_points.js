import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leaguesToFix = [
            "6a10abe66bb40cd90498cca8", // jam esports
            "6a1104f781beb9b56df55c19", // IMPERIO GITANO
            "6a11a866f2f3fd97f4bebaa2", // ISLANDIA
            "6a12b9de0e3fb8a695696e81", // Cryzen gaming
            "6a145946ae60292863d37d2e"  // ADCEUTA ESPORTS
        ];
        
        console.log("=== Updating zzRaydenzz basePoints to 55.2 in zero-mode leagues ===");
        for (const id of leaguesToFix) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(id) });
            if (league) {
                const basePoints = league.basePoints || {};
                const updatedBasePoints = { ...basePoints };
                
                // Remove lowercase/cased variants and set exact key to 55.2
                Object.keys(updatedBasePoints).forEach(key => {
                    if (key.toLowerCase() === 'zzraydenzz') {
                        delete updatedBasePoints[key];
                    }
                });
                updatedBasePoints["zzRaydenzz"] = 55.2;
                
                await db.collection('fantasy_leagues').updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { basePoints: updatedBasePoints } }
                );
                console.log(`- League "${league.name}": Set basePoints.zzRaydenzz = 55.2`);
            } else {
                console.log(`- League with ID ${id} not found.`);
            }
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
