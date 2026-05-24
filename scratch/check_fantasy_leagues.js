import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const uri = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/bot_torneos_vpg';
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- FANTASY CONFIG ---');
        const config = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
        console.log('Global active_leagues in config:', config);
        
        console.log('\n--- FANTASY LEAGUES ---');
        const leaguesList = await db.collection('fantasy_leagues').find().toArray();
        for (const league of leaguesList) {
            console.log(`League: ${league.name} (ID: ${league._id})`);
            console.log(` - vpgLeagueSlugs:`, league.vpgLeagueSlugs || league.vpgLeagueSlug);
            console.log(` - pointsMode:`, league.pointsMode);
            
            // Count teams in this league
            const teamsCount = await db.collection('fantasy_teams').countDocuments({ leagueId: league._id.toString() });
            console.log(` - Teams/Users: ${teamsCount}`);
            
            // Count total players owned in this league
            const teams = await db.collection('fantasy_teams').find({ leagueId: league._id.toString() }).toArray();
            let totalPlayersOwned = 0;
            const uniquePlayers = new Set();
            teams.forEach(t => {
                if (Array.isArray(t.players)) {
                    totalPlayersOwned += t.players.length;
                    t.players.forEach(p => uniquePlayers.add(p));
                }
            });
            console.log(` - Total players owned by teams: ${totalPlayersOwned} (Unique: ${uniquePlayers.size})`);
        }
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}
run();
