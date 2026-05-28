import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "ferstari96i";
        
        // Find which fantasy teams own him
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^' + playerName + '$', 'i') }
        }).toArray();
        
        console.log(`=== FANTASY TEAMS OWNING ${playerName} ===`);
        for (const t of teams) {
            console.log(`Team: ${t.teamName} (League ID: ${t.leagueId})`);
            console.log(` - Lineup POR: ${t.lineup?.POR}`);
            console.log(` - Lineup DFC: ${JSON.stringify(t.lineup?.DFC)}`);
            console.log(` - Lineup MC: ${JSON.stringify(t.lineup?.MC)}`);
            console.log(` - Lineup DC: ${JSON.stringify(t.lineup?.DC)}`);
            
            // Check if he is a starter (in lineup)
            let isStarter = false;
            if (t.lineup) {
                const l = t.lineup;
                if (l.POR && l.POR.toLowerCase() === playerName) isStarter = true;
                if (l.DFC && l.DFC.some(p => p && p.toLowerCase() === playerName)) isStarter = true;
                if (l.MC && l.MC.some(p => p && p.toLowerCase() === playerName)) isStarter = true;
                if (l.DC && l.DC.some(p => p && p.toLowerCase() === playerName)) isStarter = true;
            }
            console.log(` - Is Starter in this team: ${isStarter}`);
            
            // Look up the league
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(t.leagueId) });
            if (league) {
                console.log(`\n=== LEAGUE ${league.name} ===`);
                console.log(` - pointsMode: ${league.pointsMode}`);
                
                // Get player base points in this league
                const basePointsMap = league.basePoints || {};
                const playerBasePoints = basePointsMap[playerName] || 0;
                console.log(` - Base points for ${playerName} in this league: ${playerBasePoints}`);
                
                // Get current player points in player_profiles
                const playerDoc = await db.collection('player_profiles').findOne({ eaPlayerName: { $regex: new RegExp('^' + playerName + '$', 'i') } });
                const currentVpgPoints = playerDoc?.stats?.vpgPoints || 0;
                console.log(` - Current VPG Points in DB: ${currentVpgPoints}`);
                
                const rawDelta = currentVpgPoints - playerBasePoints;
                console.log(` - Raw delta (currentVpgPoints - playerBasePoints): ${rawDelta}`);
                
                // If pointsMode is zero, does it reset? Or is it calculated differently?
                // Let's check how the delta is computed in fantasyVpgSync.js
            }
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
