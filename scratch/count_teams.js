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
        
        const total = await db.collection('fantasy_teams').countDocuments({});
        console.log('Total de equipos fantasy en la BD:', total);
        
        // Count how many had less than 11 players in their players array
        const emptyTeams = await db.collection('fantasy_teams').countDocuments({
            $or: [
                { players: { $exists: false } },
                { players: { $size: 0 } },
                { "players.10": { $exists: false } } // Less than 11 players in roster
            ]
        });
        console.log('Equipos con menos de 11 jugadores en roster:', emptyTeams);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
