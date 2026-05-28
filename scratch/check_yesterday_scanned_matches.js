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
        
        console.log('=== BUSCANDO PARTIDOS DEL 26 DE MAYO ===\n');
        
        // Search scanned_matches for dates on May 26, 2026
        const start = new Date("2026-05-26T00:00:00Z");
        const end = new Date("2026-05-26T23:59:59Z");
        
        const count = await db.collection('scanned_matches').countDocuments({
            date: { $gte: start, $lte: end }
        });
        
        console.log(`Partidos del 26 de mayo en scanned_matches: ${count}`);
        
        // Let's print unique VPG teams that played according to scanned_matches
        if (count > 0) {
            const matches = await db.collection('scanned_matches').find({
                date: { $gte: start, $lte: end }
            }).toArray();
            
            const clubs = new Set();
            matches.forEach(m => {
                if (m.homeTeam?.name) clubs.add(m.homeTeam.name);
                if (m.awayTeam?.name) clubs.add(m.awayTeam.name);
            });
            
            console.log(`Clubes únicos encontrados (${clubs.size}):`);
            console.log(Array.from(clubs).slice(0, 20).join(', '));
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
