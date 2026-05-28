import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();

    console.log('--- SCANNING ALL PLAYERS ASSOCIATED WITH GUINEA PINK FOR WRONG LEAGUE ---');

    // Guinea Pink is in superliga-spain-b
    const expectedLeague = 'superliga-spain-b';

    // Find all player profiles that match club "GUINEA PINK" or have been associated with it
    // Wait, let's find players whose lastClub matches "GUINEA PINK"
    const gpPlayers = await db.collection('player_profiles').find({
        lastClub: 'GUINEA PINK'
    }).toArray();

    console.log(`Currently, there are ${gpPlayers.length} players with lastClub = "GUINEA PINK":`);
    for (const p of gpPlayers) {
        console.log(`- ${p.eaPlayerName} | vpgLeagueSlug: ${p.vpgLeagueSlug} | vpgTeamSlug: ${p.vpgTeamSlug}`);
    }

    // Now, let's look for players who have vpgTeamSlug: 'guinea-pink' but lastClub is NOT "GUINEA PINK"
    const mismatchedClub = await db.collection('player_profiles').find({
        vpgTeamSlug: 'guinea-pink',
        lastClub: { $ne: 'GUINEA PINK' }
    }).toArray();

    console.log(`\nPlayers with vpgTeamSlug = "guinea-pink" but lastClub != "GUINEA PINK":`);
    for (const p of mismatchedClub) {
        console.log(`- ${p.eaPlayerName} | lastClub: ${p.lastClub} | vpgLeagueSlug: ${p.vpgLeagueSlug}`);
    }

    // Now, let's search for players whose names are known Guinea Pink players, but currently have a DIFFERENT club/league
    // In our first script we found 26 players. Let's look up if any player has their vpgLeagueSlug set to a 5th division,
    // and let's check if they belong to Guinea Pink.
    console.log('\nScanning all player profiles with 5th division leagueSlug:');
    const fifthDivPlayers = await db.collection('player_profiles').find({
        vpgLeagueSlug: /quinta/i
    }).toArray();
    
    for (const p of fifthDivPlayers) {
        console.log(`- ${p.eaPlayerName} | Club: ${p.lastClub} | League: ${p.vpgLeagueSlug}`);
    }

    process.exit(0);
}

run().catch(console.error);
