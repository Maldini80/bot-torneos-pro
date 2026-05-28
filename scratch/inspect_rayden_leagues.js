import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagueIds = [
            "6a10abe66bb40cd90498cca8",
            "6a11a866f2f3fd97f4bebaa2",
            "6a12b9de0e3fb8a695696e81",
            "6a1104f781beb9b56df55c19",
            "6a145946ae60292863d37d2e"
        ];
        
        console.log("=== Inspecting Leagues ===");
        for (const id of leagueIds) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(id) });
            if (league) {
                console.log(`\nLeague ID: ${id} | Name: ${league.name}`);
                console.log(` - pointsMode: ${league.pointsMode}`);
                console.log(` - basePoints defined: ${league.basePoints ? 'yes' : 'no'}`);
                if (league.basePoints) {
                    // Check if zzRaydenzz exists in basePoints (case-insensitive check)
                    const keys = Object.keys(league.basePoints);
                    const match = keys.find(k => k.toLowerCase() === 'zzraydenzz');
                    console.log(`   zzRaydenzz key: "${match || 'not found'}" -> value: ${match ? league.basePoints[match] : 'N/A'}`);
                }
            } else {
                console.log(`League ID: ${id} not found as ObjectId.`);
                // Let's check as string
                const leagueStr = await db.collection('fantasy_leagues').findOne({ _id: id });
                if (leagueStr) {
                    console.log(`   Found as String key!`);
                } else {
                    console.log(`   Not found as String key either.`);
                }
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
