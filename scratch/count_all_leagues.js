import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const uri = process.env.DATABASE_URL;
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const leaguesCol = db.collection('fantasy_leagues');
        const teamsCol = db.collection('fantasy_teams');
        const bidsCol = db.collection('fantasy_bids');
        
        const totalLeagues = await leaguesCol.countDocuments();
        const totalTeams = await teamsCol.countDocuments();
        const totalBids = await bidsCol.countDocuments();
        
        console.log(`=== DATABASE STATS ===`);
        console.log(`Total Fantasy Leagues in DB: ${totalLeagues}`);
        console.log(`Total Teams/Users across all leagues: ${totalTeams}`);
        console.log(`Total active/pending bids in database: ${totalBids}`);
        
        // Find configuration
        const activeLeaguesDoc = await db.collection('fantasy_config').findOne({ key: "active_leagues" });
        console.log(`\nActive leagues list in config:`, activeLeaguesDoc);
        
        // Find leagues with active teams
        const leaguesWithTeams = await teamsCol.distinct('leagueId');
        console.log(`\nLeagues that have at least 1 team/manager: ${leaguesWithTeams.length}`);
        
        // Count divisions mapped in all leagues
        const allLeagues = await leaguesCol.find({}).toArray();
        let totalMappedDivisions = 0;
        let leaguesWithDivisions = 0;
        allLeagues.forEach(l => {
            const slugs = l.vpgLeagueSlugs || (l.vpgLeagueSlug ? [l.vpgLeagueSlug] : []);
            if (slugs.length > 0) {
                totalMappedDivisions += slugs.length;
                leaguesWithDivisions++;
            }
        });
        console.log(`Leagues with mapped VPG divisions: ${leaguesWithDivisions}`);
        console.log(`Total VPG divisions mapped across all leagues: ${totalMappedDivisions}`);
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
