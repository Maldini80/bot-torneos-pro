import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagues = [
            '6a10abe66bb40cd90498cca8', // jam esports
            '6a11a866f2f3fd97f4bebaa2', // ISLANDIA
            '6a12b9de0e3fb8a695696e81', // Cryzen gaming
            '6a1104f781beb9b56df55c19', // IMPERIO GITANO
            '6a145946ae60292863d37d2e', // ADCEUTA ESPORTS
            '6a148980081e5b79d9a94701'  // UD Las Palmas
        ];
        
        for (const id of leagues) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(id) });
            console.log(`\nLeague: "${league?.name}" (ID: ${id}) | pointsMode: ${league?.pointsMode}`);
            if (league && league.basePoints) {
                const entries = Object.entries(league.basePoints);
                console.log(`  Total basePoints entries: ${entries.length}`);
                // Print a sample of non-zero entries
                const nonZero = entries.filter(([k, v]) => v > 0);
                console.log(`  Non-zero basePoints entries: ${nonZero.length}`);
                console.log(`  Sample (first 5 non-zero):`, JSON.stringify(nonZero.slice(0, 5)));
                const zero = entries.filter(([k, v]) => v === 0);
                console.log(`  Zero basePoints entries: ${zero.length}`);
            } else {
                console.log(`  No basePoints map found.`);
            }
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
