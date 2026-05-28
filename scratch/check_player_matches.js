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
        
        console.log('=== DETALLES DE PARTIDOS ESCANEADOS ===\n');
        
        for (const pName of PLAYERS) {
            console.log(`Buscando partidos para "${pName}"...`);
            // Search in scanned_matches where player name is in any team's players or lineup/stats
            const matches = await db.collection('scanned_matches').find({
                $or: [
                    { "homeTeam.players.name": { $regex: new RegExp('^' + pName + '$', 'i') } },
                    { "awayTeam.players.name": { $regex: new RegExp('^' + pName + '$', 'i') } },
                    { "players.name": { $regex: new RegExp('^' + pName + '$', 'i') } },
                    { "matchDetails.players.name": { $regex: new RegExp('^' + pName + '$', 'i') } }
                ]
            }).sort({ date: -1 }).toArray();
            
            console.log(`Encontrados ${matches.length} partidos en scanned_matches.`);
            if (matches.length > 0) {
                console.log('Partidos más recientes:');
                matches.slice(0, 5).forEach(m => {
                    const matchDate = m.date ? (m.date.toISOString ? m.date.toISOString() : m.date) : 'N/A';
                    console.log(`  - [${matchDate}] MatchID: ${m.matchId || m._id} | Home: ${m.homeTeam?.name} vs Away: ${m.awayTeam?.name}`);
                });
            }
            console.log('---------------------------------------------------\n');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
