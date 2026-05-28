import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
        console.log("Active VPG leagues in config:", config ? config.slugs : "None");
        
        const activeLeaguesCount = await db.collection('fantasy_leagues').countDocuments({ status: { $ne: 'closed' } });
        console.log("Active fantasy leagues in DB:", activeLeaguesCount);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
