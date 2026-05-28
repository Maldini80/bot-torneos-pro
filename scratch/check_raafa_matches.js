import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "raafagonzaa98";
        
        // Find one sample match to see schema
        const sampleMatch = await db.collection('scanned_matches').findOne({});
        console.log("Sample match schema keys:", Object.keys(sampleMatch || {}));
        
        // Find matches where raafagonzaa98 played
        const query = {
            $or: [
                { "players.eaPlayerName": playerName },
                { "players.eaPlayerName": { $regex: new RegExp('^' + playerName + '$', 'i') } },
                { "lineup": playerName },
                { "lineup": { $regex: new RegExp('^' + playerName + '$', 'i') } }
            ]
        };
        
        const matches = await db.collection('scanned_matches').find(query).toArray();
        console.log(`\nMatches found where ${playerName} played: ${matches.length}`);
        
        matches.sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));
        
        matches.forEach((m, idx) => {
            console.log(`\nMatch ${idx + 1}:`);
            console.log(`  - Date: ${m.date || m.createdAt}`);
            console.log(`  - Match Type: ${m.matchType || 'N/A'}`);
            console.log(`  - Teams: ${m.homeTeam?.name || m.homeTeam} vs ${m.awayTeam?.name || m.awayTeam}`);
            console.log(`  - League: ${m.vpgLeagueSlug || m.leagueSlug || 'N/A'}`);
            // find player stats in match
            const pStats = m.players?.find(p => p.eaPlayerName.toLowerCase() === playerName.toLowerCase());
            if (pStats) {
                console.log(`  - Player Stats: CleanSheet: ${pStats.cleanSheet || pStats.cleanSheets}, Saves: ${pStats.saves}, Points: ${pStats.points}`);
            }
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
