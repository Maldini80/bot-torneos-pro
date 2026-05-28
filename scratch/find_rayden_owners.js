import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log("Searching fantasy_teams for players containing 'rayden'...");
        const teams = await db.collection('fantasy_teams').find({}).toArray();
        const found = [];
        for (const t of teams) {
            const players = t.players || [];
            const matchingPlayers = players.filter(p => p.toLowerCase().includes('rayden'));
            if (matchingPlayers.length > 0) {
                found.push({
                    teamName: t.teamName,
                    leagueId: t.leagueId,
                    players: matchingPlayers
                });
            }
        }
        console.log(`Found ${found.length} teams owning a player containing 'rayden':`);
        console.log(JSON.stringify(found, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
