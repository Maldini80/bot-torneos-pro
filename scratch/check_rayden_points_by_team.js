import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "zzRaydenzz";
        const playerLower = playerName.toLowerCase();
        
        // Find player in player_profiles
        const player = await db.collection('player_profiles').findOne({
            eaPlayerName: { $regex: new RegExp('^' + playerName + '$', 'i') }
        });
        
        const currentVpgPoints = player?.stats?.vpgPoints || 0;
        console.log(`Current VPG Points for ${playerName}: ${currentVpgPoints}\n`);
        
        // Find teams owning him
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^' + playerName + '$', 'i') }
        }).toArray();
        
        for (const t of teams) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(t.leagueId) });
            const leagueName = league ? league.name : 'Unknown';
            const pointsMode = league ? league.pointsMode : 'Unknown';
            
            // Check baseline points in league
            const basePointsMap = league?.basePoints || {};
            const basePoints = basePointsMap[playerLower] ?? basePointsMap[playerName] ?? 0;
            
            // Check if starter
            let isStarter = false;
            if (t.lineup) {
                const l = t.lineup;
                if (l.POR && l.POR.toLowerCase() === playerLower) isStarter = true;
                if (l.DFC && l.DFC.some(p => p && p.toLowerCase() === playerLower)) isStarter = true;
                if (l.MC && l.MC.some(p => p && p.toLowerCase() === playerLower)) isStarter = true;
                if (l.DC && l.DC.some(p => p && p.toLowerCase() === playerLower)) isStarter = true;
            }
            
            // Calculate delta
            let delta = 0;
            if (pointsMode === 'zero') {
                delta = currentVpgPoints - basePoints;
            } else if (pointsMode === 'accumulated') {
                delta = currentVpgPoints;
            }
            
            console.log(`League: "${leagueName}" (ID: ${t.leagueId}) | Mode: ${pointsMode}`);
            console.log(` - Team Name: "${t.teamName}"`);
            console.log(` - Is Starter: ${isStarter}`);
            console.log(` - Base Points saved in league: ${basePoints}`);
            console.log(` - Calculated Delta: ${delta}`);
            
            // Wait, does the team have point logs or can we see what points the team received?
            // E.g. in this run, how much money/points did the team get?
            // Let's print out the team's points field too
            console.log(` - Team Total Points: ${t.points}`);
            console.log(` - Team Budget/Money: ${t.budget}`);
            console.log(`-----------------------------------------------`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
