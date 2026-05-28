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
        
        // Find by regex case-insensitive
        const team = await db.collection('fantasy_teams').findOne({ 
            $or: [
                { name: { $regex: new RegExp('Arbeloa', 'i') } },
                { teamName: { $regex: new RegExp('Arbeloa', 'i') } }
            ]
        });
        
        console.log('Team Arbeloa Document:', JSON.stringify(team, null, 2));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
