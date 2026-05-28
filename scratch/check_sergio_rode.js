import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        // Search player profiles with a case-insensitive regex for sergio and rode
        const query = {
            eaPlayerName: { $regex: /sergio.*rode|rode.*sergio/i }
        };
        
        const playerProfiles = await db.collection('player_profiles').find(query).toArray();
        
        console.log(`=== REPORT FOR SERGIO RODE ===`);
        console.log(`Profiles found: ${playerProfiles.length}\n`);
        
        for (const p of playerProfiles) {
            console.log(`Player Name: "${p.eaPlayerName}"`);
            console.log(`Club: ${p.lastClub || 'N/A'}`);
            console.log(`League Slug: ${p.vpgLeagueSlug || 'N/A'}`);
            const rawPoints = p.stats?.vpgPoints || 0;
            console.log(`VPG Total Points (rawPoints): ${rawPoints}`);
            
            // Search all fantasy leagues where this player has basePoints
            const leagues = await db.collection('fantasy_leagues').find({}).toArray();
            let entries = [];
            for (const l of leagues) {
                const basePointsMap = l.basePoints || {};
                const keys = Object.keys(basePointsMap).filter(k => k.toLowerCase() === p.eaPlayerName.toLowerCase());
                if (keys.length > 0) {
                    const baseVal = basePointsMap[keys[0]];
                    const leaguePoints = Math.max(0, Math.round((rawPoints - baseVal) * 10) / 10);
                    entries.push({
                        leagueName: l.name,
                        pointsMode: l.pointsMode,
                        basePoints: baseVal,
                        leaguePoints: leaguePoints
                    });
                }
            }
            console.log(`Active Leagues Configured (${entries.length}):`);
            if (entries.length === 0) {
                console.log(`  - No active leagues found in basePoints map.`);
            } else {
                entries.forEach(e => {
                    console.log(`  - [${e.leagueName}] Mode: ${e.pointsMode} | BasePoints: ${e.basePoints} | League Points: ${e.leaguePoints}`);
                });
            }
            console.log(`----------------------------------------\n`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
