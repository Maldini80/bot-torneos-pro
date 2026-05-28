import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

const PLAYERS = ["Adrianbr03", "eric0055k", "Manelibz4_"];

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== BUSCANDO NOTICIAS DE LOS JUGADORES ===\n');
        
        for (const pName of PLAYERS) {
            console.log(`Buscando noticias para "${pName}"...`);
            const news = await db.collection('fantasy_news').find({
                $or: [
                    { eaPlayerName: { $regex: new RegExp(pName, 'i') } },
                    { message: { $regex: new RegExp(pName, 'i') } }
                ]
            }).toArray();
            
            console.log(`Encontradas ${news.length} noticias:`);
            news.forEach(n => {
                console.log(`  - [${new Date(n.timestamp).toISOString()}] Liga: ${n.leagueId} | Tipo: ${n.type} | Mensaje: ${n.message}`);
            });
            console.log('---------------------------------------------------\n');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
