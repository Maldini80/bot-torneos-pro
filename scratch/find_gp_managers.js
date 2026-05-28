import { getDb, connectDb } from '../database.js';

async function run() {
    await connectDb();
    const db = getDb();

    console.log('--- FINDING GUINEA PINK PLAYERS AS FANTASY MANAGERS ---');

    // 1. Get all Guinea Pink players' profiles from player_profiles
    const gpPlayers = await db.collection('player_profiles').find({
        $or: [
            { lastClub: 'GUINEA PINK' },
            { vpgTeamSlug: 'guinea-pink' }
        ]
    }).toArray();

    const gpPlayerNames = gpPlayers.map(p => p.eaPlayerName.toLowerCase());
    console.log(`Guinea Pink players in DB: ${gpPlayerNames.join(', ')}`);

    // 2. Query vpg_users for these player profiles (matching by vpgUsername or origin/psn etc.)
    // We can also match by discordId if we check fantasy teams
    const allUsers = await db.collection('vpg_users').find({}).toArray();
    const gpUsers = [];

    for (const u of allUsers) {
        if (!u.vpgUsername) continue;
        const matches = gpPlayerNames.includes(u.vpgUsername.toLowerCase()) || 
                        (u.psnId && gpPlayerNames.includes(u.psnId.toLowerCase())) ||
                        (u.eaId && gpPlayerNames.includes(u.eaId.toLowerCase()));
        if (matches) {
            gpUsers.push(u);
        }
    }

    console.log(`\nFound ${gpUsers.length} Discord users matching Guinea Pink players:`);
    for (const u of gpUsers) {
        console.log(`- User: ${u.vpgUsername} | Discord ID: ${u.discordId} | PSN: ${u.psnId} | EA: ${u.eaId}`);
        
        // Find their fantasy teams across all leagues
        const fTeams = await db.collection('fantasy_teams').find({ discordId: u.discordId }).toArray();
        console.log(`  Fantasy teams (${fTeams.length}):`);
        for (const ft of fTeams) {
            const league = await db.collection('fantasy_leagues').findOne({ _id: ft.leagueId.toString() });
            console.log(`    * Team: "${ft.teamName}" | League: "${league ? league.name : 'Unknown'}" (ID: ${ft.leagueId})`);
            console.log(`      Roster:`, ft.players);
            
            // Check how many Guinea Pink players were in their roster
            const gpPlayersInRoster = (ft.players || []).filter(name => gpPlayerNames.includes(name.toLowerCase()));
            console.log(`      Guinea Pink players in this roster:`, gpPlayersInRoster);
        }
    }

    // 3. Let's also check all fantasy teams in Superliga B fantasy leagues that contained Guinea Pink players
    // Wait, let's find fantasy leagues that are associated with superliga-spain-b
    const leagues = await db.collection('fantasy_leagues').find({}).toArray();
    const superligaBLeagues = leagues.filter(l => l.vpgLeagues && l.vpgLeagues.includes('superliga-spain-b'));
    console.log(`\nSuperliga B fantasy leagues:`, superligaBLeagues.map(l => l.name));

    process.exit(0);
}

run().catch(console.error);
