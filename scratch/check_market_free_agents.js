import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagues = await db.collection('fantasy_leagues')
            .find({ status: { $ne: 'closed' } })
            .limit(3)
            .toArray();
            
        console.log(`=== CHECKING FREE AGENT POOLS ===`);
        for (const league of leagues) {
            const fa = league.marketFreeAgents || [];
            console.log(`League: ${league.name} (${league._id})`);
            console.log(` - Number of Free Agents: ${fa.length}`);
            console.log(` - Sample Free Agents: ${fa.slice(0, 5).join(', ')}...`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
