import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        const playerName = "zzraydenzz";
        
        // Find player in player_profiles
        const player = await db.collection('player_profiles').findOne({
            eaPlayerName: { $regex: new RegExp('^' + playerName + '$', 'i') }
        });
        
        if (player) {
            console.log(`Found player profile in player_profiles:`);
            console.log(` - eaPlayerName: ${player.eaPlayerName}`);
            console.log(` - lastClub: ${player.lastClub}`);
            console.log(` - vpgLeagueSlug: ${player.vpgLeagueSlug}`);
        } else {
            console.log(`No profile found for ${playerName} in player_profiles.`);
        }
        
        // Find which fantasy teams own him
        const teams = await db.collection('fantasy_teams').find({
            players: { $regex: new RegExp('^' + playerName + '$', 'i') }
        }).toArray();
        
        console.log(`\n=== FANTASY TEAMS OWNING ${playerName} ===`);
        if (teams.length === 0) {
            console.log('No teams own this player.');
        } else {
            for (const t of teams) {
                // Find league name
                const league = await db.collection('fantasy_leagues').findOne({ _id: new ObjectId(t.leagueId) });
                const leagueName = league ? league.name : 'Unknown League';
                
                // Check if he is a starter (in lineup)
                let isStarter = false;
                if (t.lineup) {
                    const l = t.lineup;
                    if (l.POR && l.POR.toLowerCase() === playerName.toLowerCase()) isStarter = true;
                    if (l.DFC && l.DFC.some(p => p && p.toLowerCase() === playerName.toLowerCase())) isStarter = true;
                    if (l.MC && l.MC.some(p => p && p.toLowerCase() === playerName.toLowerCase())) isStarter = true;
                    if (l.DC && l.DC.some(p => p && p.toLowerCase() === playerName.toLowerCase())) isStarter = true;
                }
                
                console.log(`League: "${leagueName}" | Fantasy Team: "${t.teamName}"`);
                console.log(` - Owner Discord ID: ${t.discordId}`);
                console.log(` - Is Starter: ${isStarter}`);
            }
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
