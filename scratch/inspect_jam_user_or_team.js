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
        
        console.log('--- BUSCANDO EQUIPOS CON "jam" ---');
        const teams = await db.collection('fantasy_teams').find({
            $or: [
                { teamName: { $regex: /jam/i } },
                { discordUsername: { $regex: /jam/i } },
                { ownerName: { $regex: /jam/i } }
            ]
        }).toArray();
        
        for (const t of teams) {
            console.log(`Equipo: ${t.teamName} | Owner: ${t.discordUsername} (${t.discordId}) | Points: ${t.points} | Balance: ${t.balance} | LeagueId: ${t.leagueId}`);
            console.log('Lineup starters:', JSON.stringify(t.lineup));
        }

        console.log('\n--- BUSCANDO LIGAS CON "jam" ---');
        const leagues = await db.collection('fantasy_leagues').find({
            $or: [
                { name: { $regex: /jam/i } },
                { code: { $regex: /jam/i } }
            ]
        }).toArray();
        for (const l of leagues) {
            console.log(`Liga: ${l.name} | Code: ${l.code} | ID: ${l._id}`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
