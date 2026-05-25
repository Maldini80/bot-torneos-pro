import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();
    
    // 1. Search for player profile
    const player = await db.collection('player_profiles').findOne({
        eaPlayerName: { $regex: /monkey/i }
    });
    console.log(`Player profile found:`, JSON.stringify(player, null, 2));
    
    // 2. Search for team "toca y vete"
    const team = await db.collection('fantasy_teams').findOne({
        name: { $regex: /toca|vete|cacahuete/i }
    });
    console.log(`Team found:`, JSON.stringify(team, null, 2));
    
    if (player && team) {
        // Check if player is on this team
        const isOnTeam = team.players && team.players.includes(player.eaPlayerName);
        console.log(`Is player on team? ${isOnTeam}`);
    }
    
    // 3. Search for the player in ALL teams
    if (player) {
        const teamsWithPlayer = await db.collection('fantasy_teams').find({
            players: player.eaPlayerName
        }).toArray();
        console.log(`Teams containing player "${player.eaPlayerName}":`, teamsWithPlayer.map(t => ({ name: t.name, leagueId: t.leagueId })));
    }
    
    // 4. Search for recent market actions
    if (player) {
        const listings = await db.collection('fantasy_market_listings').find({
            eaPlayerName: player.eaPlayerName
        }).toArray();
        console.log(`Market listings for player:`, listings);
        
        const bids = await db.collection('fantasy_market_bids').find({
            eaPlayerName: player.eaPlayerName
        }).toArray();
        console.log(`Market bids for player:`, bids);
        
        const buyouts = await db.collection('fantasy_buyouts').find({
            eaPlayerName: player.eaPlayerName
        }).toArray();
        console.log(`Buyouts for player:`, buyouts);
    }
    
    process.exit(0);
}

run().catch(console.error);
