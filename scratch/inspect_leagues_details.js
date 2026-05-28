import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leagues = await db.collection('fantasy_leagues').find({}).toArray();
        console.log(`=== FANTASY LEAGUES POINT MODE AND RAYDEN BASEPOINTS ===`);
        for (const l of leagues) {
            const basePoints = l.basePoints || {};
            const val = basePoints["zzRaydenzz"] ?? basePoints["zzraydenzz"] ?? 'NOT FOUND';
            
            // Check if Rayden is in any team in this league
            const teamsWithRayden = await db.collection('fantasy_teams').find({
                leagueId: l._id.toString(),
                $or: [
                    { players: /zzraydenzz/i },
                    { lineup: /zzraydenzz/i },
                    { roster: /zzraydenzz/i }
                ]
            }).toArray();
            
            const hasTeams = teamsWithRayden.length > 0;
            const teamNames = teamsWithRayden.map(t => `${t.teamName} (${t.discordUsername || t.discordId})`).join(', ');
            
            if (val !== 'NOT FOUND' || hasTeams) {
                console.log(`- League: "${l.name}" (ID: ${l._id})`);
                console.log(`   * Points Mode: ${l.pointsMode}`);
                console.log(`   * basePoints.zzRaydenzz: ${val}`);
                console.log(`   * Owned by teams in league: ${hasTeams ? 'YES -> ' + teamNames : 'NO'}`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
